import {
    Account,
    AccountMetadataTransaction,
    Address,
    AggregateTransaction,
    Convert,
    CosignatureSignedTransaction,
    CosignatureTransaction,
    Deadline,
    HashLockTransaction, IListener,
    InnerTransaction,
    KeyGenerator,
    Metadata,
    MetadataSearchCriteria,
    MetadataType,
    Mosaic,
    MosaicDefinitionTransaction,
    MosaicFlags,
    MosaicId,
    MosaicMetadataTransaction,
    MosaicNonce,
    MosaicSupplyChangeAction,
    MosaicSupplyChangeTransaction,
    NamespaceId,
    NamespaceMetadataTransaction,
    NamespaceRegistrationTransaction,
    NetworkConfiguration,
    NetworkType,
    PublicAccount,
    RepositoryFactoryHttp,
    SignedTransaction,
    TransactionAnnounceResponse,
    TransactionFees,
    TransactionGroup,
    TransactionMapping,
    TransactionService,
    UInt64
} from "symbol-sdk";
import assert from "assert";
import {firstValueFrom, Subscription} from "rxjs";
import moment from "moment";
import {sha3_256} from "js-sha3";


export namespace SymbolService {

    export type MetadataTransaction = AccountMetadataTransaction |
        MosaicMetadataTransaction |
        NamespaceMetadataTransaction;

    interface SymbolServiceConfig {
        emit_mode?: boolean;
        logging?: boolean;
        node_url: string;
        fee_ratio: number;
        deadline_hours: number;
    }

    let config: SymbolServiceConfig = {
        emit_mode: true,
        logging: true,
        node_url: "",
        fee_ratio: 0.0,
        deadline_hours: 2,
    };

    export const init = (cfg: SymbolServiceConfig) => {
        config = { ...config, ...cfg };
    };

    export interface SignedAggregateTx {
        signedTx: SignedTransaction;
        cosignatures: CosignatureSignedTransaction[];
        maxFee: UInt64;
    }

    // Local cache
    let network: {
        nodeUrl: string,
        networkType: NetworkType,
        repositoryFactory: RepositoryFactoryHttp,
        epochAdjustment: number,
        networkGenerationHash: string,
        networkCurrencyMosaicId: MosaicId,
        transactionFees: TransactionFees,
        networkProperties: NetworkConfiguration,
        updated_at: number,
    } | null = null;

    const logger = {
        error: (message?: any, ...args: any[]) => config.logging && console.error(message, ...args),
        log: (message?: any, ...args: any[]) => config.logging && console.log(message, ...args),
        debug: (message?: any, ...args: any[]) => config.logging && console.debug(message, ...args),
    };

    const test = {
        confirmedTxPayloads: new Map<string, string>(),
        partialTxPayloads: new Map<string, string>(),
    };


    export const getNetwork = async (nodeUrl: string = config.node_url) => {
        if (!network || nodeUrl !== network.nodeUrl || moment(network.updated_at).add(5, "minutes").isSameOrBefore()) {
            logger.debug(`Retrieving network properties by node: ${nodeUrl}`);
            const repositoryFactory = new RepositoryFactoryHttp(nodeUrl);
            const epochAdjustment = await firstValueFrom(repositoryFactory.getEpochAdjustment());
            const networkGenerationHash = await firstValueFrom(repositoryFactory.getGenerationHash());
            const networkCurrencyMosaicId = (await firstValueFrom(repositoryFactory.getCurrencies())).currency.mosaicId;
            assert(networkCurrencyMosaicId);
            const networkHttp = repositoryFactory.createNetworkRepository();
            const transactionFees = await firstValueFrom(networkHttp.getTransactionFees());
            const networkType = await firstValueFrom(networkHttp.getNetworkType());
            const networkProperties = await firstValueFrom(networkHttp.getNetworkProperties());

            network = {
                nodeUrl,
                networkType,
                repositoryFactory,
                epochAdjustment,
                networkGenerationHash,
                networkCurrencyMosaicId,
                transactionFees,
                networkProperties,
                updated_at: moment.now(),
            };
        }

        return network;
    };

    export const getFeeMultiplier = async (ratio: number = config.fee_ratio) => {
        const { transactionFees } = await getNetwork();
        return transactionFees.minFeeMultiplier + transactionFees.averageFeeMultiplier * ratio;
    };

    export const generateKey = (key: string) => KeyGenerator.generateUInt64Key(key);

    const announceTx = async (tx: SignedTransaction) => {
        if (!config.emit_mode) {
            logger.debug(`Emulate announcing tx: ${tx.hash}`);
            test.confirmedTxPayloads.set(tx.hash, tx.payload);
            return new TransactionAnnounceResponse();
        }

        logger.debug(`Announcing tx: ${tx.hash}`);
        const { repositoryFactory } = await getNetwork();
        return firstValueFrom(repositoryFactory.createTransactionRepository()
            .announce(tx));
    };

    // Returning the promise that will wait for adding aggregate bonded transactions.
    const announceTxWithHashLock = async (
        hashLockTx: SignedTransaction,
        tx: SignedTransaction,
    ) => {
        if (!config.emit_mode) {
            logger.debug(`Emulate announcing tx: ${tx.hash}`);
            test.partialTxPayloads.set(tx.hash, tx.payload);
            return AggregateTransaction.createFromPayload(tx.payload);
        }

        const { repositoryFactory } = await getNetwork();

        const listener = repositoryFactory.createListener();
        const transactionService = new TransactionService(
            repositoryFactory.createTransactionRepository(),
            repositoryFactory.createReceiptRepository()
        );

        logger.debug(`Announcing tx: ${tx.hash}`);
        await listener.open();
        return firstValueFrom(transactionService
            .announceHashLockAggregateBonded(
                hashLockTx,
                tx,
                listener))
            .finally(() => {
                listener.close()
            });
    };

    const createSignedTxWithCosignatures = async (
        signedTx: SignedTransaction,
        cosignatureSignedTxs: CosignatureSignedTransaction[]
    ) => {
        let payload = signedTx.payload;

        cosignatureSignedTxs.forEach((cosignedTransaction) => {
            payload += cosignedTransaction.version.toHex() + cosignedTransaction.signerPublicKey + cosignedTransaction.signature;
        });

        // Calculate new size
        const size = `00000000${(payload.length / 2).toString(16)}`;
        const formatedSize = size.substring(size.length - 8);
        const littleEndianSize =
            formatedSize.substring(6, 8) +
            formatedSize.substring(4, 6) +
            formatedSize.substring(2, 4) +
            formatedSize.substring(0, 2);

        payload = littleEndianSize + payload.substring(8);

        return new SignedTransaction(payload, signedTx.hash, signedTx.signerPublicKey, signedTx.type, signedTx.networkType);
    };

    // The transaction MUST NOT be aggregate complete
    export const announceTxWithCosignatures = async (
        signedTx: SignedTransaction,
        cosignatures: CosignatureSignedTransaction[],
    ) => {
        // DO NOT modify the transaction!
        const completeSignedTx = await createSignedTxWithCosignatures(
            signedTx,
            cosignatures
        );

        return announceTx(completeSignedTx).then((res) => res.message);
    };

    // Returns:
    //   - txs: Array of InnerTransaction
    //   - mosaicId: Generated mosaic ID
    export const createMosaicDefinitionTx = async (
        creatorAccount: PublicAccount,
        durationBlocks: UInt64,
        divisibility: number,
        supplyAmount: number,
        isSupplyMutable: boolean = true,
        isTransferable: boolean = true,
        isRestrictable: boolean = true,
        isRevokable: boolean = false,
    ) => {
        const { epochAdjustment, networkType } = await getNetwork();

        const nonce = MosaicNonce.createRandom();
        const mosaicId = MosaicId.createFromNonce(nonce, creatorAccount.address);
        const txs = new Array<InnerTransaction>();

        txs.push(
            MosaicDefinitionTransaction.create(
                Deadline.create(epochAdjustment, config.deadline_hours),
                nonce,
                mosaicId,
                MosaicFlags.create(isSupplyMutable, isTransferable, isRestrictable, isRevokable),
                divisibility,
                durationBlocks,
                networkType,
            ).toAggregate(creatorAccount)
        );

        txs.push(
            MosaicSupplyChangeTransaction.create(
                Deadline.create(epochAdjustment, config.deadline_hours),
                mosaicId,
                MosaicSupplyChangeAction.Increase,
                UInt64.fromUint(supplyAmount * Math.pow(10, divisibility)),
                networkType,
            ).toAggregate(creatorAccount)
        );

        return {
            txs,
            mosaicId,
        };
    };

    // Arguments:
    //   - name: The name can be up to 64 characters long.
    //   - durationBlocks: At least 86400 (30minutes) or long
    export const createNamespaceRegistrationTx = async (
        ownerAccount: PublicAccount,
        name: string,
        durationBlocks: UInt64,
    ) => {
        const { epochAdjustment, networkType } = await getNetwork();
        return NamespaceRegistrationTransaction.createRootNamespace(
            Deadline.create(epochAdjustment, config.deadline_hours),
            name,
            durationBlocks,
            networkType,
        ).toAggregate(ownerAccount);
    };

    // When type is mosaic: targetAccount must be mosaic creator
    // When type is namespace: targetAccount must be namespace owner
    export const createMetadataTx = async (
        type: MetadataType,
        sourceAccount: PublicAccount,
        targetAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId | string,
        key: string | UInt64,
        value: string | Uint8Array,
        sizeDelta?: number,
    ) => {
        const { epochAdjustment, networkType } = await getNetwork();
        const valueBytes = typeof(value) === "string" ? Convert.utf8ToUint8(value) : value;
        const actualKey = typeof(key) === "string" ? generateKey(key) : key;
        const actualSizeDelta = sizeDelta === undefined ? valueBytes.length : sizeDelta;

        switch (type) {
            case MetadataType.Mosaic: {
                return MosaicMetadataTransaction.create(
                    Deadline.create(epochAdjustment, config.deadline_hours),
                    targetAccount.address,
                    typeof(key) === "string" ? generateKey(key) : key,
                    typeof(targetId) === "string" ? new MosaicId(targetId) : targetId as MosaicId,
                    actualSizeDelta,
                    valueBytes,
                    networkType,
                ).toAggregate(sourceAccount);
            }

            case MetadataType.Namespace: {
                return NamespaceMetadataTransaction.create(
                    Deadline.create(epochAdjustment, config.deadline_hours),
                    targetAccount.address,
                    actualKey,
                    typeof(targetId) === "string" ? new NamespaceId(targetId) : targetId as NamespaceId,
                    actualSizeDelta,
                    valueBytes,
                    networkType,
                ).toAggregate(sourceAccount);
            }

            default: {
                return AccountMetadataTransaction.create(
                    Deadline.create(epochAdjustment, config.deadline_hours),
                    targetAccount.address,
                    actualKey,
                    actualSizeDelta,
                    valueBytes,
                    networkType
                ).toAggregate(sourceAccount);
            }
        }
    };

    export const composeAggregateCompleteTx = async (
        feeMultiplier: number,
        numCosigner: number,
        txs: InnerTransaction[],
    ) => {
        const { epochAdjustment, networkType } = await getNetwork();
        return AggregateTransaction.createComplete(
            Deadline.create(epochAdjustment, config.deadline_hours),
            txs,
            networkType,
            [])
            // Use network transaction fee
            .setMaxFeeForAggregate(feeMultiplier, numCosigner);
    };

    export const composeAggregateBondedTx = async (
        feeMultiplier: number,
        numCosigner: number,
        txs: InnerTransaction[],
    ) => {
        const { epochAdjustment, networkType } = await getNetwork();
        return AggregateTransaction.createBonded(
            Deadline.create(epochAdjustment, config.deadline_hours),
            txs,
            networkType,
            [])
            // Use network transaction fee
            .setMaxFeeForAggregate(feeMultiplier, numCosigner);
    };

    export const createHashLockTx = async (feeMultiplier: number, tx: SignedTransaction) => {
        const { epochAdjustment, networkCurrencyMosaicId, networkType } = await getNetwork();

        return HashLockTransaction.create(
            Deadline.create(epochAdjustment, config.deadline_hours),
            new Mosaic(
                networkCurrencyMosaicId,
                UInt64.fromUint(10000000),
            ),
            UInt64.fromUint(480),
            tx,
            networkType)
            // Use network transaction fee
            .setMaxFee(feeMultiplier);
    };

    // Returns undefined if tx not found.
    export const getConfirmedTx = async (txHash: string) => {
        if (!config.emit_mode) {
            const txPayload = test.confirmedTxPayloads.get(txHash);
            return txPayload ? TransactionMapping.createFromPayload(txPayload) : undefined;
        }

        const { repositoryFactory } = await getNetwork();
        const txHttp = repositoryFactory.createTransactionRepository();

        return firstValueFrom(txHttp.getTransaction(txHash, TransactionGroup.Confirmed))
            .then((tx) => tx.transactionInfo?.hash)
            .catch((e) => undefined);
    };

    // Returns undefined if tx not found.
    export const getPartialTx = async (txHash: string) => {
        if (!config.emit_mode) {
            const txPayload = test.partialTxPayloads.get(txHash);
            return txPayload ? TransactionMapping.createFromPayload(txPayload) : undefined;
        }

        const { repositoryFactory } = await getNetwork();
        const txHttp = repositoryFactory.createTransactionRepository();

        return firstValueFrom(txHttp.getTransaction(txHash, TransactionGroup.Partial))
            .then((tx) => tx.transactionInfo?.hash)
            .catch((e) => undefined);
    };

    const listenTxs = async (
        listener: IListener,
        account: Account | PublicAccount,
        txHashes: string[],
        group: "confirmed" | "partial" | "all" = "confirmed",
    ) => {
        const { repositoryFactory } = await getNetwork();
        const statusHttp = repositoryFactory.createTransactionStatusRepository();
        const subscriptions = new Array<Subscription>();

        const promises = txHashes.map((txHash) => new Promise<{ txHash: string, error?: string }>(
            async (resolve, reject) => {
                subscriptions.push(
                    listener.status(account.address, txHash)
                        .subscribe({
                            next: async (value) => {
                                const error = `Received error status: ${value.code}`;
                                logger.error(error);
                                resolve({ txHash, error });
                            },
                            error: (e) => {
                                reject(e);
                            }
                        })
                );
                if (["confirmed", "all"].includes(group)) {
                    subscriptions.push(
                        listener.confirmed(account.address, txHash)
                            .subscribe({
                                next: async (tx) => {
                                    resolve({ txHash, error: undefined });
                                },
                                error: (e) => {
                                    reject(e);
                                }
                            })
                    );
                }
                if (["partial", "all"].includes(group)) {
                    subscriptions.push(
                        listener.aggregateBondedAdded(account.address, txHash, true)
                            .subscribe({
                                next: async (tx) => {
                                    resolve({ txHash, error: undefined });
                                },
                                error: (e) => {
                                    reject(e);
                                }
                            })
                    );
                }

                const status = await firstValueFrom(statusHttp.getTransactionStatus(txHash))
                    .catch((e) => undefined);
                if (status?.code?.startsWith("Failure")) {
                    // Transaction Failed
                    const error = `Received error status: ${status.code}`;
                    logger.error(error);
                    resolve({ txHash, error: error });
                } else if ((["confirmed", "all"].includes(group) && await getConfirmedTx(txHash)) ||
                    (["partial", "all"].includes(group) && await getPartialTx(txHash))
                ) {
                    // Already confirmed
                    resolve({ txHash, error: undefined });
                }
            })
        );

        return Promise.all(promises)
            .finally(() => {
                subscriptions.forEach((subscription) => subscription.unsubscribe());
            });
    }

    // Wait till tx(s) has been confirmed.
    // Returns:
    //   - Array of results
    export const waitTxsFor = async (
        account: Account | PublicAccount,
        txHashes?: string | string[],
        group: "confirmed" | "partial" | "all" = "confirmed",
    ) => {
        if (!config.emit_mode) {
            return Promise.resolve([]);
        }

        const { repositoryFactory } = await getNetwork();
        const listener = repositoryFactory.createListener();
        await listener.open();

        // Wait for all txs in parallel
        return listenTxs(listener, account, (typeof(txHashes) === "string" ? [txHashes] : (txHashes || [])), group)
            .finally(() => {
                listener.close();
            });
    };

    // Receive all metadata that are matched criteria
    export const searchMetadata = async (
        type: MetadataType,
        criteria: {
            target?: Account | PublicAccount | Address,
            source?: Account | PublicAccount | Address,
            key?: string | UInt64,
            targetId?: MosaicId | NamespaceId,
        },
        pageSize: number = 100,
    ) => {
        const { repositoryFactory } = await getNetwork();
        const metadataHttp = repositoryFactory.createMetadataRepository();

        const searchCriteria: MetadataSearchCriteria = {
            targetAddress: criteria.target && (
                criteria.target instanceof Address ? criteria.target : criteria.target.address
            ),
            sourceAddress: criteria.source && (
                criteria.source instanceof Address ? criteria.source : criteria.source.address
            ),
            scopedMetadataKey: typeof(criteria.key) === "string"
                ? generateKey(criteria.key).toHex()
                : criteria.key?.toHex(),
            targetId: criteria.targetId && criteria.targetId,
            metadataType: type,
            pageSize,
        };

        let batch;
        let pageNumber = 1;
        const metadataPool = new Array<Metadata>();
        do {
            batch = await firstValueFrom(
                metadataHttp.search({ ...searchCriteria, pageNumber: pageNumber++ })
            ).then((page) => page.data);
            metadataPool.push(...batch);
        } while (batch.length === pageSize);

        return metadataPool;
    };

    // Returns: Array of signed aggregate complete TX and cosignatures (when cosigners are specified)
    export const buildSignedAggregateCompleteTxBatches = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners?: Account[],
        feeRatio: number = 0,
        batchSize: number = 100,
    ) => {
        const { networkGenerationHash } = await getNetwork();
        const feeMultiplier = await getFeeMultiplier(feeRatio);
        const txPool = [ ...txs ];
        const batches = new Array<SignedAggregateTx>();

        do {
            const innerTxs = txPool.splice(0, batchSize);
            const aggregateTx = await composeAggregateCompleteTx(
                feeMultiplier,
                cosigners?.length || 0,
                innerTxs,
            );

            const signedTx = signer.sign(aggregateTx, networkGenerationHash);
            const cosignatures = cosigners?.map(
                (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, signedTx.hash)
            ) || [];

            batches.push({
                signedTx,
                cosignatures,
                maxFee: aggregateTx.maxFee,
            });
        } while (txPool.length);

        return batches;
    };

    // Announce aggregate TXs in parallel
    // Returns:
    //   - Succeeded: undefined
    //   - Failed: errors
    export const executeBatches = async (
        batches: SignedAggregateTx[],
        signer: Account | PublicAccount,
        maxParallel: number = 10
    ) => {
        const txPool = [ ...batches ];
        const workers = new Array<Promise<{txHash: string, error?: string}[] | undefined>>();

        const { repositoryFactory } = await getNetwork();
        const listener = repositoryFactory.createListener();
        await listener.open();

        for (let i = 0; i < maxParallel; i++) {
            workers.push(new Promise(async (resolve) => {
                const nextBatch = () => txPool.splice(0, 1).shift();
                for (let batch = nextBatch(); batch; batch = nextBatch()) {
                    await announceTxWithCosignatures(batch.signedTx, batch.cosignatures);
                    const errors = (await listenTxs(listener, signer, [batch.signedTx.hash], "confirmed"))
                        .filter((result) => result.error);
                    if (errors.length) {
                        resolve(errors);
                    }
                }
                resolve(undefined);
            }));
        }

        return Promise.all(workers)
            .then((workerErrors) => workerErrors
                .filter((error) => error)
                .reduce(
                    (acc, curr) => [ ...(acc || []), ...(curr || []) ],
                    undefined,
                )
            )
            .finally(() => {
                listener.close();
            });
    };

    export const calculateMetadataHash = (
        type: MetadataType,
        sourceAddress: Address,
        targetAddress: Address,
        targetId: undefined | MosaicId | NamespaceId,
        scopedMetadataKey: UInt64,
    ) => {
        const hasher = sha3_256.create()
        hasher.update(sourceAddress.encodeUnresolvedAddress());
        hasher.update(targetAddress.encodeUnresolvedAddress());
        hasher.update(Convert.hexToUint8Reverse(scopedMetadataKey.toHex()));
        hasher.update(Convert.hexToUint8Reverse(targetId?.toHex() || "0000000000000000"))
        hasher.update(Convert.numberToUint8Array(type, 1));
        return hasher.hex().toUpperCase();
    };

    export const getMetadataByHash = async (
        compositeHash: string,
    ) => {
        const {repositoryFactory} = await getNetwork();
        const metadataHttp = repositoryFactory.createMetadataRepository();
        return firstValueFrom(metadataHttp.getMetadata(compositeHash));
    };

}