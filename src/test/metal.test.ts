import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import {MetalService} from "../services";
import fs from "fs";
import {
    Account,
    AccountMetadataTransaction, Convert,
    InnerTransaction,
    Metadata, MetadataEntry,
    MetadataType,
    MosaicId,
    NamespaceId,
    UInt64
} from "symbol-sdk";
import {SymbolService} from "../services";
import {Utils} from "../libs";
import Long from "long";
import assert from "assert";
import moment from "moment";
import { Base64 } from "js-base64";


describe("MetalService", () => {
    let target: Account;
    let metadataKey: UInt64;
    let metalAdditive: Uint8Array;
    let testData: Uint8Array;
    let dataChunks: number;
    let metadataPool: Metadata[];
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let metalId: string;
    let batchSize: number;

    beforeAll(async () => {
        const config = initTestEnv();
        batchSize = config.batch_size;

        assert(process.env.TEST_INPUT_FILE);
        testData = fs.readFileSync(process.env.TEST_INPUT_FILE);
        dataChunks = Math.ceil(Base64.fromUint8Array(testData).length / 1000);

        const assets = await MetalTest.generateAssets();
        target = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    const doBatches = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners: Account[],
    ) => {
        assert(process.env.BATCH_SIZE);
        const start = moment.now();
        const errors = await SymbolTest.doAggregateTxBatches(
            txs,
            signer,
            cosigners,
            (batches, totalFee) => {
                console.log(`totalFee=${Utils.toXYM(Long.fromString(totalFee.toString()))}`);
                console.log(`batches.length=${batches.length}`);

                expect(batches.length).toBe(Math.ceil(dataChunks / batchSize));
            });
        console.log(`announce time=${moment().diff(start, "seconds", true)}secs, errors=${errors?.length || 0}`);
        return errors;
    };

    it("Compute metal ID and restore metadata hash", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();
        const metadataHash = SymbolService.calculateMetadataHash(
            MetadataType.Mosaic,
            source.address,
            target.address,
            mosaicId,
            MetalService.generateMetadataKey("test1keyhohohogehoge"),
        );
        console.log(`metadataHash=${metadataHash}`);

        const metalId = MetalService.calculateMetalId(
            MetadataType.Mosaic,
            source.address,
            target.address,
            mosaicId,
            MetalService.generateMetadataKey("test1keyhohohogehoge"),
        );
        console.log(`metalId=${metalId}`);

        const restoredHash = MetalService.restoreMetadataHash(metalId);
        console.log(`restoredHash=${restoredHash}`);

        expect(restoredHash).toBe(metadataHash);
    });

    it("Forge account metal", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await MetalService.createForgeTxs(
            MetadataType.Account,
            source.publicAccount,
            target.publicAccount,
            undefined,
            testData,
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalService.calculateMetalId(
            MetadataType.Account,
            source.address,
            target.address,
            undefined,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${Convert.uint8ToUtf8(additive)}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, source, [ target ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode account metal", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();
        const result = await MetalService.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Account);
        expect(result?.sourceAddress).toStrictEqual(source.address);
        expect(result?.targetAddress).toStrictEqual(target.address);
        expect(result?.key).toStrictEqual(metadataKey);
        expect(result?.targetId).toBeUndefined();
    }, 600000);

    it("Verify account metal", () => {
        const result = MetalService.verifyMetadataKey(metadataKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap account metal", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();
        const txs = await MetalService.createScrapTxs(
            MetadataType.Account,
            source.publicAccount,
            target.publicAccount,
            undefined,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, source, [ target ]);

        expect(errors).toBeUndefined();

        metadataPool = await SymbolService.searchMetadata(MetadataType.Account, { target });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Forge mosaic metal", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await MetalService.createForgeTxs(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            mosaicId,
            testData,
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalService.calculateMetalId(
            MetadataType.Mosaic,
            target.address,
            creator.address,
            mosaicId,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${Convert.uint8ToUtf8(additive)}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, creator, [ target ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode mosaic metal", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const result = await MetalService.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Mosaic);
        expect(result?.sourceAddress).toStrictEqual(target.address);
        expect(result?.targetAddress).toStrictEqual(creator.address);
        expect(result?.key).toStrictEqual(metadataKey);
        expect(result?.targetId?.toHex()).toBe(mosaicId.toHex());
    }, 600000);

    it("Verify mosaic metal", () => {
        const result = MetalService.verifyMetadataKey(metadataKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap mosaic metal", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const txs = await MetalService.createScrapTxs(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            mosaicId,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, creator, [ target ]);

        expect(errors).toBeUndefined();

        metadataPool = await SymbolService.searchMetadata(MetadataType.Mosaic, { targetId: mosaicId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Forge namespace metal", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await MetalService.createForgeTxs(
            MetadataType.Namespace,
            target.publicAccount,
            owner.publicAccount,
            namespaceId,
            testData,
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalService.calculateMetalId(
            MetadataType.Namespace,
            target.address,
            owner.address,
            namespaceId,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${Convert.uint8ToUtf8(additive)}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, owner, [ target ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode namespace metal", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();
        const result = await MetalService.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Namespace);
        expect(result?.sourceAddress).toStrictEqual(target.address);
        expect(result?.targetAddress).toStrictEqual(owner.address);
        expect(result?.key).toStrictEqual(metadataKey);
        expect(result?.targetId?.toHex()).toBe(namespaceId.toHex());
    }, 600000);

    it("Scrap namespace metal", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();
        const txs = await MetalService.createScrapTxs(
            MetadataType.Namespace,
            target.publicAccount,
            owner.publicAccount,
            namespaceId,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, owner, [ target ]);

        expect(errors).toBeUndefined();

        metadataPool = await SymbolService.searchMetadata(MetadataType.Namespace, { targetId: namespaceId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Destroy mosaic metal", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const { txs: forgeTxs, additive } = await MetalService.createForgeTxs(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            mosaicId,
            testData,
        );
        await doBatches(forgeTxs, creator, [ target ]);

        const destroyTxs = await MetalService.createDestroyTxs(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            mosaicId,
            testData,
            additive,
        );
        const errors = await doBatches(destroyTxs, creator, [ target ]);

        expect(errors).toBeUndefined();

        metadataPool = await SymbolService.searchMetadata(MetadataType.Mosaic, { targetId: mosaicId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Failed to create Scrap TXs", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = (await MetalTest.forgeMetal(
            MetadataType.Mosaic,
            signer1.publicAccount,
            signer1.publicAccount,
            mosaicId,
            testData,
            signer1,
            []
        ));

        const metadataPool = await SymbolService.searchMetadata(MetadataType.Mosaic, {
            source: signer1.publicAccount,
            target: signer1.publicAccount,
            targetId: mosaicId,
        });

        // Break metadata value
        const brokenMetadataPool = [ ...metadataPool ];
        brokenMetadataPool[5] = new Metadata(
            brokenMetadataPool[5].id,
            new MetadataEntry(
                brokenMetadataPool[5].metadataEntry.version,
                brokenMetadataPool[5].metadataEntry.compositeHash,
                brokenMetadataPool[5].metadataEntry.sourceAddress,
                brokenMetadataPool[5].metadataEntry.targetAddress,
                brokenMetadataPool[5].metadataEntry.scopedMetadataKey,
                brokenMetadataPool[5].metadataEntry.metadataType,
                "",
                brokenMetadataPool[5].metadataEntry.targetId
            )
        );

        const txs1 = await MetalService.createScrapTxs(
            MetadataType.Mosaic,
            signer1.publicAccount,
            signer1.publicAccount,
            mosaicId,
            key,
            brokenMetadataPool
        );

        expect(txs1).toBeUndefined();

        // Break metadata chain
        brokenMetadataPool.splice(5, 1);

        const txs2 = await MetalService.createScrapTxs(
            MetadataType.Mosaic,
            signer1.publicAccount,
            signer1.publicAccount,
            mosaicId,
            key,
            brokenMetadataPool
        );

        expect(txs2).toBeUndefined();

        await MetalTest.scrapMetal(metalId, signer1.publicAccount, signer1.publicAccount, signer1, []);
    }, 600000);

    it("Failed to decode metal", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = (await MetalTest.forgeMetal(
            MetadataType.Namespace,
            signer1.publicAccount,
            signer1.publicAccount,
            namespaceId,
            testData,
            signer1,
            []
        ));

        const metadataPool = await SymbolService.searchMetadata(MetadataType.Namespace, {
            source: signer1.publicAccount,
            target: signer1.publicAccount,
            targetId: namespaceId,
        });

        // Break metadata value
        const brokenMetadataPool = [ ...metadataPool ];
        brokenMetadataPool[10] = new Metadata(
            brokenMetadataPool[10].id,
            new MetadataEntry(
                brokenMetadataPool[10].metadataEntry.version,
                brokenMetadataPool[10].metadataEntry.compositeHash,
                brokenMetadataPool[10].metadataEntry.sourceAddress,
                brokenMetadataPool[10].metadataEntry.targetAddress,
                brokenMetadataPool[10].metadataEntry.scopedMetadataKey,
                brokenMetadataPool[10].metadataEntry.metadataType,
                "",
                brokenMetadataPool[10].metadataEntry.targetId
            )
        );

        const txs1 = await MetalService.createScrapTxs(
            MetadataType.Namespace,
            signer1.publicAccount,
            signer1.publicAccount,
            namespaceId,
            key,
            brokenMetadataPool
        );

        expect(txs1).toBeUndefined();

        // Break metadata chain
        brokenMetadataPool.splice(10, 1);

        const txs2 = await MetalService.createScrapTxs(
            MetadataType.Namespace,
            signer1.publicAccount,
            signer1.publicAccount,
            namespaceId,
            key,
            brokenMetadataPool
        );

        expect(txs2).toBeUndefined();

        await MetalTest.scrapMetal(metalId, signer1.publicAccount, signer1.publicAccount, signer1, []);
    }, 600000);
});