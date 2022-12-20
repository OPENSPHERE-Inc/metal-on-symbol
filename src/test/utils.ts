import assert from "assert";
import {
    Account,
    Convert,
    MetadataType,
    MosaicId,
    NamespaceId,
    PublicAccount,
} from "symbol-sdk";
import {MetalService, SymbolService, SymbolTest} from "../services";
import {Logger} from "../libs";


export { SymbolTest };
export let symbolService: SymbolService;
export let metalService: MetalService;

export const initTestEnv = () => {
    Logger.init({ log_level: Logger.LogLevel.DEBUG });
    symbolService = SymbolTest.init();
    metalService = new MetalService(symbolService);
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
        additive?: Uint8Array,
    ) => {
        const { key, txs, additive: additiveBytes } = await metalService.createForgeTxs(
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
        console.log(`additive=${Convert.uint8ToUtf8(additiveBytes)}`)

        await SymbolTest.announceAll(txs, signer, cosignerAccounts);

        const metalId = MetalService.calculateMetalId(
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
            additiveBytes,
        };
    };

    export const scrapMetal = async (
        metalId: string,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        signerAccount: Account,
        cosignerAccounts: Account[]
    ) => {
        const metadataEntry = (await metalService.getFirstChunk(metalId)).metadataEntry;

        const txs = await metalService.createScrapTxs(
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

}