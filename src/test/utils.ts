import assert from "assert";
import { Account, Convert, MetadataType, MosaicId, NamespaceId, PublicAccount, } from "symbol-sdk";
import { Logger } from "../libs";
import { MetalServiceV2, SignedAggregateTx, SymbolService, SymbolTest } from "../services";
import { MetalService } from "../services/compat";


export { SymbolTest };
export let symbolService: SymbolService;
export let metalServiceV1: MetalService;
export let metalServiceV2: MetalServiceV2;

export const initTestEnv = () => {
    Logger.init({ log_level: Logger.LogLevel.DEBUG });
    symbolService = SymbolTest.init();
    metalServiceV1 = new MetalService(symbolService);
    metalServiceV2 = new MetalServiceV2(symbolService);
};

export namespace MetalTest {

    export const forgeMetal = async (
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        signer: Account,
        cosignerAccounts: Account[],
        additive?: number,
    ) => {
        const { key, txs, additive: actualAdditive } = await metalServiceV2.createForgeTxs(
            type,
            sourcePubAccount,
            targetPubAccount,
            targetId,
            payload,
            additive,
        );
        assert(txs.length);
        console.log(`key=${key.toHex()}`);
        console.log(`txs.length=${txs.length}`);
        console.log(`additive=${actualAdditive}`)

        await SymbolTest.announceAll(txs, signer, cosignerAccounts);

        const metalId = MetalServiceV2.calculateMetalId(
            type,
            sourcePubAccount.address,
            targetPubAccount.address,
            targetId,
            key,
        );
        console.log(`Computed Metal ID is ${metalId}`);

        return {
            metalId,
            key,
            additive: actualAdditive,
        };
    };

    export const scrapMetal = async (
        metalId: string,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        signerAccount: Account,
        cosignerAccounts: Account[]
    ) => {
        const metadataEntry = (await metalServiceV2.getFirstChunk(metalId)).metadataEntry;

        const txs = await metalServiceV2.createScrapTxs(
            metadataEntry.metadataType,
            sourcePubAccount,
            targetPubAccount,
            metadataEntry.targetId,
            metadataEntry.scopedMetadataKey,
        );
        assert(txs);
        console.log(`txs.length=${txs.length}`);

        await SymbolTest.announceAll(txs, signerAccount, cosignerAccounts);
    };

    export const compareBatches = (batches1?: SignedAggregateTx[], batches2?: SignedAggregateTx[]) => {
        batches1?.forEach((batch, index) => {
            expect(batch.signedTx.payload).toStrictEqual(batches2?.[index].signedTx.payload);
            expect(batch.maxFee.toDTO()).toStrictEqual(batches2?.[index].maxFee.toDTO());
            expect(batch.cosignatures.map(
                ({ signature, signerPublicKey, parentHash}) =>
                    ({ signature, signerPublicKey, parentHash }))
            ).toStrictEqual(batches2?.[index].cosignatures.map(
                ({ signature, signerPublicKey, parentHash}) =>
                    ({ signature, signerPublicKey, parentHash }))
            );
        });
    };

    export const forgeMetalV1 = async (
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        signer: Account,
        cosignerAccounts: Account[],
        additive?: Uint8Array,
    ) => {
        const { key, txs, additive: actualAdditive } = await metalServiceV1.createForgeTxs(
            type,
            sourcePubAccount,
            targetPubAccount,
            targetId,
            payload,
            additive,
        );
        assert(txs.length);
        console.log(`key=${key.toHex()}`);
        console.log(`txs.length=${txs.length}`);
        console.log(`additive=${Convert.uint8ToUtf8(actualAdditive)}`)

        await SymbolTest.announceAll(txs, signer, cosignerAccounts);

        const metalId = MetalServiceV2.calculateMetalId(
            type,
            sourcePubAccount.address,
            targetPubAccount.address,
            targetId,
            key,
        );
        console.log(`Computed Metal ID is ${metalId}`);

        return {
            metalId,
            key,
            additive: actualAdditive,
        };
    };
}
