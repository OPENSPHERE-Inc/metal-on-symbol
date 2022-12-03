import assert from "assert";
import {SymbolService} from "../services";
import {
    Account,
    Convert,
    CosignatureTransaction,
    InnerTransaction,
    MetadataType,
    MosaicId,
    NamespaceId,
    PublicAccount,
    UInt64
} from "symbol-sdk";
import {v4 as uuidv4} from "uuid";
import {MetalService} from "../services";


export const initTestEnv = () => {
    assert(process.env.NODE_URL);
    assert(process.env.FEE_RATIO);
    assert(process.env.BATCH_SIZE);
    assert(process.env.MAX_PARALLELS);

    const config = {
        node_url: process.env.NODE_URL,
        fee_ratio: Number(process.env.FEE_RATIO),
        logging: true,
        deadline_hours: 5,
        batch_size: Number(process.env.BATCH_SIZE),
        max_parallels: Number(process.env.MAX_PARALLELS),
    };
    SymbolService.init(config);

    return config;
};


export namespace SymbolTest {

    export const getNamedAccounts = async () => {
        assert(process.env.SIGNER1_PRIVATE_KEY);
        assert(process.env.PAYER_PRIVATE_KEY);

        const { networkType } = await SymbolService.getNetwork();
        return {
            signer1: Account.createFromPrivateKey(process.env.SIGNER1_PRIVATE_KEY, networkType),
            payer: Account.createFromPrivateKey(process.env.PAYER_PRIVATE_KEY, networkType),
        };
    };

    export const doAggregateTx = async (txs: InnerTransaction[], signer: Account, cosigners: Account[]) => {
        const aggregateTx = await SymbolService.composeAggregateCompleteTx(
            await SymbolService.getFeeMultiplier(0),
            cosigners.length,
            txs
        );
        const { networkGenerationHash } = await SymbolService.getNetwork();
        const signedTx = signer.sign(aggregateTx, networkGenerationHash);
        const cosignatures = cosigners.map(
            (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, signedTx.hash)
        );
        await SymbolService.announceTxWithCosignatures(signedTx, cosignatures);
        return (await SymbolService.waitTxsFor(signer, signedTx.hash, "confirmed")).shift();
    };

    export const doAggregateTxBatches = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners: Account[],
        batchesCreatedCallback?: (batches: SymbolService.SignedAggregateTx[], totalFee: UInt64) => void,
    ) => {
        const batches = await SymbolService.buildSignedAggregateCompleteTxBatches(
            txs,
            signer,
            cosigners,
        );
        const totalFee = batches.reduce(
            (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
        );

        batchesCreatedCallback?.(batches, totalFee);

        return SymbolService.executeBatches(batches, signer);
    };
}

export namespace MetalTest {

    export const generateAssets = async () => {
        // Generate account
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { networkType } = await SymbolService.getNetwork();
        const account = Account.generateNewAccount(networkType);
        console.log(
            `account.address=${account.address.plain()}\n` +
            `  .publicKey=${account.publicKey}\n` +
            `  .privateKey=${account.privateKey}\n`
        );

        // Define new mosaic
        const mosaicDefinition = await SymbolService.createMosaicDefinitionTx(
            signer1.publicAccount,
            UInt64.fromUint(20),
            0,
            1,
        );
        await SymbolTest.doAggregateTx(mosaicDefinition.txs, signer1, [])
            .then((result) => {
                expect(result?.error).toBeUndefined();
            });
        const mosaicId = mosaicDefinition.mosaicId;
        console.log(`mosaicId=${mosaicId.toHex()}`);

        // Register new namespace
        const namespaceName = uuidv4();
        const namespaceTx = await SymbolService.createNamespaceRegistrationTx(
            signer1.publicAccount,
            namespaceName,
            UInt64.fromUint(86400),
        );
        await SymbolTest.doAggregateTx([ namespaceTx ], signer1, [])
            .then((result) => {
                expect(result?.error).toBeUndefined();
            });
        const namespaceId = new NamespaceId(namespaceName);
        console.log(`namespaceId=${namespaceId.toHex()}`);

        return {
            account,
            mosaicId,
            namespaceId,
        };
    };

    export const announceAll = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners: Account[]
    ) => {
        const batches = await SymbolService.buildSignedAggregateCompleteTxBatches(
            txs,
            signer,
            cosigners,
        );
        assert(batches.length);
        console.log(`batches.length=${batches.length}`);

        const totalFee = batches.reduce(
            (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
        );
        console.log(`totalFee=${totalFee.toString()}`);

        const errors = await SymbolService.executeBatches(batches, signer);
        errors?.forEach(({txHash, error}) => {
            console.error(`${txHash}: ${error}`);
        });
        assert(!errors?.length);
    };

    export const forgeMetal = async (
        type: MetadataType,
        sourceAccount: PublicAccount,
        targetAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Buffer,
        signer: Account,
        cosigners: Account[],
        additive?: Uint8Array,
    ) => {
        const { key, txs, additive: additiveBytes } = await MetalService.createForgeTxs(
            type,
            sourceAccount,
            targetAccount,
            targetId,
            payload,
            additive,
        );
        assert(txs.length);
        console.log(`key=${key.toHex()}`);
        console.log(`txs.length=${txs.length}`);
        console.log(`additive=${Convert.uint8ToUtf8(additiveBytes)}`)

        await announceAll(txs, signer, cosigners);

        const metalId = MetalService.calculateMetalId(
            type,
            sourceAccount.address,
            targetAccount.address,
            targetId,
            key,
        );
        console.log(`Computed Metal ID is ${metalId}`);

        return {
            metalId,
            key,
            additiveBytes,
        };
    };

    export const scrapMetal = async (
        metalId: string,
        sourceAccount: PublicAccount,
        targetAccount: PublicAccount,
        signer: Account,
        cosigners: Account[]
    ) => {
        const metadataEntry = (await MetalService.getFirstChunk(metalId)).metadataEntry;

        const txs = await MetalService.createScrapTxs(
            metadataEntry.metadataType,
            sourceAccount,
            targetAccount,
            metadataEntry.targetId,
            metadataEntry.scopedMetadataKey,
        );
        assert(txs);
        console.log(`txs.length=${txs.length}`);

        await announceAll(txs, signer, cosigners);
    };

}