import {ReinforceInput} from "./input";
import assert from "assert";
import {IntermediateTxs, readIntermediateFile, writeIntermediateFile} from "../intermediate";
import {ReinforceOutput} from "./output";
import {MetadataTransaction, SymbolService} from "../../services";
import {
    AggregateTransaction,
    Convert,
    CosignatureSignedTransaction,
    CosignatureTransaction,
    Deadline,
    InnerTransaction,
    MetadataType,
    MosaicId,
    NamespaceId,
    PublicAccount,
    SignedTransaction,
    UInt64
} from "symbol-sdk";
import moment from "moment/moment";
import {Logger} from "../../libs";
import {readStreamInput} from "../stream";
import prompts from "prompts";
import {metalService, symbolService} from "../common";


export namespace ReinforceCLI {

    const buildReferenceTxPool = async (
        command: "forge" | "scrap",
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive?: string
    ) => {
        const additiveBytes = additive ? Convert.utf8ToUint8(additive) : undefined;
        const txs = command === "forge"
            ? (await metalService.createForgeTxs(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                payload,
                additiveBytes,
            )).txs
            : await metalService.createDestroyTxs(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                payload,
                additiveBytes,
            );
        return txs.reduce(
            (acc, curr) => acc.set((curr as MetadataTransaction).scopedMetadataKey.toHex(), curr),
            new Map<string, InnerTransaction>()
        );
    };

    const retrieveBatches = async (intermediateTxs: IntermediateTxs, referenceTxPool: Map<string, InnerTransaction>) => {
        const { networkType, networkGenerationHash } = await symbolService.getNetwork();
        const networkGenerationHashBytes = Array.from(Convert.hexToUint8(networkGenerationHash));
        const signerPubAccount = PublicAccount.createFromPublicKey(intermediateTxs.signerPublicKey, networkType);

        return intermediateTxs.txs.map((tx) => {
            // Collect inner transactions
            const innerTxs = tx.keys.map((key) => {
                const referenceTx = referenceTxPool.get(key);
                if (!referenceTx) {
                    throw new Error("Input file is wrong or broken.");
                }
                return referenceTx;
            });

            // Rebuild aggregate transaction with signature
            const aggregateTx = AggregateTransaction.createComplete(
                Deadline.createFromAdjustedValue(tx.deadline),
                innerTxs,
                networkType,
                [],
                new UInt64(tx.maxFee),
                tx.signature,
                signerPubAccount,
            );

            const recalculatedHash = AggregateTransaction.createTransactionHash(
                aggregateTx.serialize(),
                networkGenerationHashBytes
            );
            if (recalculatedHash !== tx.hash) {
                throw new Error("Transaction's hash was mismatched.");
            }

            // Cast signed transaction
            const signedTx = new SignedTransaction(
                // Inner transaction's deadline will be removed.
                aggregateTx.serialize(),
                tx.hash,
                signerPubAccount.publicKey,
                aggregateTx.type,
                aggregateTx.networkType
            );

            const cosignatures = [
                ...tx.cosignatures.map((cosignature) => new CosignatureSignedTransaction(
                    cosignature.parentHash,
                    cosignature.signature,
                    cosignature.signerPublicKey
                ))
            ];

            return {
                signedTx,
                cosignatures,
                maxFee: new UInt64(tx.maxFee),
            };
        });
    };

    const reinforceMetal = async (
        input: Readonly<ReinforceInput.CommandlineInput>,
        intermediateTxs: IntermediateTxs,
        payload: Uint8Array,
    ): Promise<ReinforceOutput.CommandlineOutput> => {
        const { networkType } = await symbolService.getNetwork();

        if (networkType !== intermediateTxs.networkType) {
            throw new Error(`Wrong network type ${intermediateTxs.networkType}`);
        }

        const cosignerAccounts = [
            ...(input.signerAccount ? [ input.signerAccount ] : []),
            ...(input.cosignerAccounts || []),
        ];
        const signerPubAccount = PublicAccount.createFromPublicKey(intermediateTxs.signerPublicKey, networkType);
        const type = intermediateTxs.type;
        const sourcePubAccount = PublicAccount.createFromPublicKey(intermediateTxs.sourcePublicKey, networkType);
        const targetPubAccount = PublicAccount.createFromPublicKey(intermediateTxs.targetPublicKey, networkType);
        const targetId = type === MetadataType.Mosaic && intermediateTxs.mosaicId
            ? new MosaicId(intermediateTxs.mosaicId)
            : type === MetadataType.Namespace && intermediateTxs.namespaceId
                ? SymbolService.createNamespaceId(intermediateTxs.namespaceId)
                : undefined;

        // Construct reference txs
        const referenceTxPool = await buildReferenceTxPool(
            intermediateTxs.command,
            type,
            sourcePubAccount,
            targetPubAccount,
            targetId,
            payload,
            intermediateTxs.additive
        );

        // Retrieve signed txs that can cosign and announce
        const batches = await retrieveBatches(intermediateTxs, referenceTxPool);

        // Add cosignatures of new cosigners
        batches.forEach((batch) => {
            batch.cosignatures.push(
                ...cosignerAccounts.map(
                    (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, batch.signedTx.hash)
                )
            );
        });

        if (input.announce) {
            Logger.info(
                `Announcing ${batches.length} aggregate TXs. ` +
                `TX fee ${SymbolService.toXYM(new UInt64(intermediateTxs.totalFee))} XYM ` +
                `will be paid by ${intermediateTxs.command} originator.`
            );
            if (!input.force && !input.stdin) {
                const decision = (await prompts({
                    type: "confirm",
                    name: "decision",
                    initial: true,
                    message: "Are you sure announce these TXs?",
                    stdout: process.stderr,
                })).decision;
                if (!decision) {
                    throw new Error("Canceled by user.");
                }
            }

            const startAt = moment.now();
            const errors = await symbolService.executeBatches(batches, signerPubAccount, input.maxParallels);
            errors?.forEach(({txHash, error}) => {
                Logger.error(`${txHash}: ${error}`);
            });

            if (errors) {
                throw new Error(`Some errors occurred during announcing.`);
            } else {
                Logger.info(`Completed in ${moment().diff(startAt, "seconds", true)} secs.`);
            }
        }

        return {
            networkType,
            batches,
            key: intermediateTxs.key !== undefined ? UInt64.fromHex(intermediateTxs.key) : undefined,
            totalFee: new UInt64(intermediateTxs.totalFee),
            additive: intermediateTxs.additive,
            sourcePubAccount,
            targetPubAccount,
            ...(intermediateTxs.mosaicId ? { mosaicId: new MosaicId(intermediateTxs.mosaicId) } : {}),
            ...(intermediateTxs.namespaceId ? { namespaceId: new NamespaceId(intermediateTxs.namespaceId) } : {}),
            status: input.announce ? "reinforced" : "estimated",
            metalId: intermediateTxs.metalId,
            signerPubAccount,
            command: intermediateTxs.command,
            type,
            createdAt: new Date(intermediateTxs.createdAt),
            payload,
        };
    };

    export const main = async (argv: string[]) => {
        let input: ReinforceInput.CommandlineInput;
        try {
            input = await ReinforceInput.validateInput(ReinforceInput.parseInput(argv));
        } catch (e) {
            ReinforceInput.printVersion();
            if (e === "version") {
                return;
            }
            ReinforceInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        // Read intermediate JSON contents here.
        assert(input.intermediatePath);
        const intermediateTxs = readIntermediateFile(input.intermediatePath);

        // Read input file here.
        const payload = await readStreamInput(input);

        const output = await reinforceMetal(input, intermediateTxs, payload);
        if (input.outputPath) {
            writeIntermediateFile(output, input.outputPath);
        }
        ReinforceOutput.printOutputSummary(output);

        return output;
    };

}

