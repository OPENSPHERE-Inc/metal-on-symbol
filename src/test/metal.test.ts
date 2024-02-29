import "./env";
import { BinMetadata, BinMetadataEntry, SignedAggregateTx } from "@opensphere-inc/symbol-service";
import assert from "assert";
import fs from "fs";
import Long from "long";
import moment from "moment";
import {
    Account,
    AccountMetadataTransaction,
    InnerTransaction,
    Metadata,
    MetadataType,
    MosaicId,
    NamespaceId,
    UInt64
} from "symbol-sdk";
import { CHUNK_PAYLOAD_MAX_SIZE, MetalServiceV2, SymbolService } from "../services";
import { initTestEnv, metalServiceV2, MetalTest, symbolService, SymbolTest } from "./utils";


describe("MetalService", () => {
    let targetAccount: Account;
    let metadataKey: UInt64;
    let metalAdditive: number;
    let testData: Uint8Array;
    let dataChunks: number;
    let metadataPool: Metadata[];
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let metalId: string;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        testData = fs.readFileSync(process.env.TEST_INPUT_FILE);
        dataChunks = Math.ceil(testData.length / CHUNK_PAYLOAD_MAX_SIZE);

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    const doBatches = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners: Account[],
        callback?: (batches: SignedAggregateTx[], totalFee: UInt64) => void,
    ) => {
        assert(process.env.BATCH_SIZE);
        const start = moment.now();
        const errors = await SymbolTest.doAggregateTxBatches(
            txs,
            signer,
            cosigners,
            callback
        );
        console.log(`announce time=${moment().diff(start, "seconds", true)}secs, errors=${errors?.length || 0}`);
        return errors;
    };

    const batchCallback = (batches: SignedAggregateTx[], totalFee: UInt64) => {
        console.log(`totalFee=${SymbolService.toXYM(Long.fromString(totalFee.toString()))}`);
        console.log(`batches.length=${batches.length}`);

        expect(batches.length).toBe(Math.ceil(dataChunks / symbolService.config.batch_size));
    };

    it("Compute metal ID and restore metadata hash", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const metadataHash = SymbolService.calculateMetadataHash(
            MetadataType.Mosaic,
            sourceAccount.address,
            targetAccount.address,
            mosaicId,
            MetalServiceV2.generateMetadataKey("test1keyhohohogehoge"),
        );
        console.log(`metadataHash=${metadataHash}`);

        const metalId = MetalServiceV2.calculateMetalId(
            MetadataType.Mosaic,
            sourceAccount.address,
            targetAccount.address,
            mosaicId,
            MetalServiceV2.generateMetadataKey("test1keyhohohogehoge"),
        );
        console.log(`metalId=${metalId}`);

        const restoredHash = MetalServiceV2.restoreMetadataHash(metalId);
        console.log(`restoredHash=${restoredHash}`);

        expect(restoredHash).toBe(metadataHash);
    });

    it("Forge account metal", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalServiceV2.createForgeTxs(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            MetalServiceV2.generateRandomAdditive(),
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalServiceV2.calculateMetalId(
            MetadataType.Account,
            sourceAccount.address,
            targetAccount.address,
            undefined,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${additive}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, sourceAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode account metal", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const result = await metalServiceV2.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Account);
        expect(result?.sourceAddress.toDTO()).toStrictEqual(sourceAccount.address.toDTO());
        expect(result?.targetAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(result?.key.toDTO()).toStrictEqual(metadataKey.toDTO());
        expect(result?.targetId).toBeUndefined();
    }, 600000);

    it("Verify account metal", () => {
        const result = MetalServiceV2.verifyMetadataKey(metadataKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap account metal", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const txs = await metalServiceV2.createScrapTxs(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, sourceAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Account, { target: targetAccount });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Forge mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalServiceV2.createForgeTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            testData,
            MetalServiceV2.generateRandomAdditive(),
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalServiceV2.calculateMetalId(
            MetadataType.Mosaic,
            targetAccount.address,
            creatorAccount.address,
            mosaicId,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${additive}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, creatorAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const result = await metalServiceV2.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Mosaic);
        expect(result?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(result?.targetAddress.toDTO()).toStrictEqual(creatorAccount.address.toDTO());
        expect(result?.key.toDTO()).toStrictEqual(metadataKey.toDTO());
        expect(result?.targetId?.toHex()).toBe(mosaicId.toHex());
    }, 600000);

    it("Verify mosaic metal", () => {
        const result = MetalServiceV2.verifyMetadataKey(metadataKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const txs = await metalServiceV2.createScrapTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, creatorAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Mosaic, { targetId: mosaicId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Forge namespace metal", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalServiceV2.createForgeTxs(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            ownerAccount.publicAccount,
            namespaceId,
            testData,
            MetalServiceV2.generateRandomAdditive(),
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalServiceV2.calculateMetalId(
            MetadataType.Namespace,
            targetAccount.address,
            ownerAccount.address,
            namespaceId,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${additive}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, ownerAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode namespace metal", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const result = await metalServiceV2.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Namespace);
        expect(result?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(result?.targetAddress.toDTO()).toStrictEqual(ownerAccount.address.toDTO());
        expect(result?.key.toDTO()).toStrictEqual(metadataKey.toDTO());
        expect(result?.targetId?.toHex()).toBe(namespaceId.toHex());
    }, 600000);

    it("Scrap namespace metal", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const txs = await metalServiceV2.createScrapTxs(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            ownerAccount.publicAccount,
            namespaceId,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, ownerAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Namespace, { targetId: namespaceId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Destroy mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const { txs: forgeTxs, additive } = await metalServiceV2.createForgeTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            testData,
            MetalServiceV2.generateRandomAdditive(),
        );
        await doBatches(forgeTxs, creatorAccount, [ targetAccount ], batchCallback);

        const destroyTxs = await metalServiceV2.createDestroyTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            testData,
            additive,
        );
        const errors = await doBatches(destroyTxs, creatorAccount, [ targetAccount ], batchCallback);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Mosaic, { targetId: mosaicId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Failed to create Scrap TXs", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = (await MetalTest.forgeMetal(
            MetadataType.Mosaic,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            mosaicId,
            testData,
            signerAccount,
            [],
            MetalServiceV2.generateRandomAdditive(),
        ));

        const metadataPool = await symbolService.searchBinMetadata(MetadataType.Mosaic, {
            source: signerAccount.publicAccount,
            target: signerAccount.publicAccount,
            targetId: mosaicId,
        });

        // Break metadata value
        const brokenMetadataPool = [ ...metadataPool ];
        brokenMetadataPool[5] = new BinMetadata(
            brokenMetadataPool[5].id,
            new BinMetadataEntry(
                brokenMetadataPool[5].metadataEntry.version,
                brokenMetadataPool[5].metadataEntry.compositeHash,
                brokenMetadataPool[5].metadataEntry.sourceAddress,
                brokenMetadataPool[5].metadataEntry.targetAddress,
                brokenMetadataPool[5].metadataEntry.scopedMetadataKey,
                brokenMetadataPool[5].metadataEntry.metadataType,
                new Uint8Array(0),
                brokenMetadataPool[5].metadataEntry.targetId
            )
        );

        const txs1 = await metalServiceV2.createScrapTxs(
            MetadataType.Mosaic,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            mosaicId,
            key,
            brokenMetadataPool
        );

        expect(txs1).toBeUndefined();

        // Break metadata chain
        brokenMetadataPool.splice(5, 1);

        const txs2 = await metalServiceV2.createScrapTxs(
            MetadataType.Mosaic,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            mosaicId,
            key,
            brokenMetadataPool
        );

        expect(txs2).toBeUndefined();

        await MetalTest.scrapMetal(metalId, signerAccount.publicAccount, signerAccount.publicAccount, signerAccount, []);
    }, 600000);

    it("Failed to decode metal", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = (await MetalTest.forgeMetal(
            MetadataType.Namespace,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            namespaceId,
            testData,
            signerAccount,
            [],
            MetalServiceV2.generateRandomAdditive(),
        ));

        const metadataPool = await symbolService.searchBinMetadata(MetadataType.Namespace, {
            source: signerAccount.publicAccount,
            target: signerAccount.publicAccount,
            targetId: namespaceId,
        });

        // Break metadata value
        const brokenMetadataPool = [ ...metadataPool ];
        brokenMetadataPool[10] = new BinMetadata(
            brokenMetadataPool[10].id,
            new BinMetadataEntry(
                brokenMetadataPool[10].metadataEntry.version,
                brokenMetadataPool[10].metadataEntry.compositeHash,
                brokenMetadataPool[10].metadataEntry.sourceAddress,
                brokenMetadataPool[10].metadataEntry.targetAddress,
                brokenMetadataPool[10].metadataEntry.scopedMetadataKey,
                brokenMetadataPool[10].metadataEntry.metadataType,
                new Uint8Array(0),
                brokenMetadataPool[10].metadataEntry.targetId
            )
        );

        const txs1 = await metalServiceV2.createScrapTxs(
            MetadataType.Namespace,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            namespaceId,
            key,
            brokenMetadataPool
        );

        expect(txs1).toBeUndefined();

        // Break metadata chain
        brokenMetadataPool.splice(10, 1);

        const txs2 = await metalServiceV2.createScrapTxs(
            MetadataType.Namespace,
            signerAccount.publicAccount,
            signerAccount.publicAccount,
            namespaceId,
            key,
            brokenMetadataPool
        );

        expect(txs2).toBeUndefined();

        await MetalTest.scrapMetal(metalId, signerAccount.publicAccount, signerAccount.publicAccount, signerAccount, []);
    }, 600000);

    const forgeWithText = async (payload: Uint8Array, text: string) => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalServiceV2.createForgeTxs(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            payload,
            MetalServiceV2.generateRandomAdditive(),
            text,
        );

        console.debug(`metadataKey=${key.toHex()}`);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalServiceV2.calculateMetalId(
            MetadataType.Account,
            sourceAccount.address,
            targetAccount.address,
            undefined,
            metadataKey,
        );

        const errors = await doBatches(txs, sourceAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();

        const result = await metalServiceV2.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(payload.buffer);
        expect(result?.text).toBe(text);

        await MetalTest.scrapMetal(
            metalId,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            sourceAccount,
            [ targetAccount ]
        );
    };

    it("Forge with text (less than CHUNK_PAYLOAD_MAX_SIZE)", async () => {
        await forgeWithText(testData, "a".repeat(CHUNK_PAYLOAD_MAX_SIZE - 100));
    }, 600000);

    it("Forge with text (CHUNK_PAYLOAD_MAX_SIZE minus one)", async () => {
        await forgeWithText(testData, "b".repeat(CHUNK_PAYLOAD_MAX_SIZE - 1));
    }, 600000);

    it("Forge with text (equal CHUNK_PAYLOAD_MAX_SIZE)", async () => {
        await forgeWithText(testData, "c".repeat(CHUNK_PAYLOAD_MAX_SIZE));
    }, 600000);

    it("Forge with text (CHUNK_PAYLOAD_MAX_SIZE plus one)", async () => {
        await forgeWithText(testData, "d".repeat(CHUNK_PAYLOAD_MAX_SIZE + 1));
    }, 600000);

    it("Forge with text (more than CHUNK_PAYLOAD_MAX_SIZE)", async () => {
        await forgeWithText(testData, "e".repeat(CHUNK_PAYLOAD_MAX_SIZE + 100));
    }, 600000);

    it("Forge with text but no payload (less than CHUNK_PAYLOAD_MAX_SIZE)", async () => {
        await forgeWithText(new Uint8Array(0), "f".repeat(CHUNK_PAYLOAD_MAX_SIZE - 100));
    }, 600000);

    it("Forge with text but no payload (equal CHUNK_PAYLOAD_MAX_SIZE)", async () => {
        await forgeWithText(new Uint8Array(0), "g".repeat(CHUNK_PAYLOAD_MAX_SIZE));
    }, 600000);

    it("Forge with text but no payload (more than CHUNK_PAYLOAD_MAX_SIZE)", async () => {
        await forgeWithText(new Uint8Array(0), "h".repeat(CHUNK_PAYLOAD_MAX_SIZE + 100));
    }, 600000);
});
