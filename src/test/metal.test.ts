import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {initTestEnv, metalService, MetalTest, symbolService, SymbolTest} from "./utils";
import {MetalService, SymbolService} from "../services";
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
import Long from "long";
import assert from "assert";
import moment from "moment";
import { Base64 } from "js-base64";


describe("MetalService", () => {
    let targetAccount: Account;
    let metadataKey: UInt64;
    let metalAdditive: Uint8Array;
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
        dataChunks = Math.ceil(Base64.fromUint8Array(testData).length / 1000);

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
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
                console.log(`totalFee=${SymbolService.toXYM(Long.fromString(totalFee.toString()))}`);
                console.log(`batches.length=${batches.length}`);

                expect(batches.length).toBe(Math.ceil(dataChunks / symbolService.config.batch_size));
            });
        console.log(`announce time=${moment().diff(start, "seconds", true)}secs, errors=${errors?.length || 0}`);
        return errors;
    };

    it("Compute metal ID and restore metadata hash", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const metadataHash = SymbolService.calculateMetadataHash(
            MetadataType.Mosaic,
            sourceAccount.address,
            targetAccount.address,
            mosaicId,
            MetalService.generateMetadataKey("test1keyhohohogehoge"),
        );
        console.log(`metadataHash=${metadataHash}`);

        const metalId = MetalService.calculateMetalId(
            MetadataType.Mosaic,
            sourceAccount.address,
            targetAccount.address,
            mosaicId,
            MetalService.generateMetadataKey("test1keyhohohogehoge"),
        );
        console.log(`metalId=${metalId}`);

        const restoredHash = MetalService.restoreMetadataHash(metalId);
        console.log(`restoredHash=${restoredHash}`);

        expect(restoredHash).toBe(metadataHash);
    });

    it("Forge account metal", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalService.createForgeTxs(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalService.calculateMetalId(
            MetadataType.Account,
            sourceAccount.address,
            targetAccount.address,
            undefined,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${Convert.uint8ToUtf8(additive)}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, sourceAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode account metal", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const result = await metalService.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Account);
        expect(result?.sourceAddress.toDTO()).toStrictEqual(sourceAccount.address.toDTO());
        expect(result?.targetAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(result?.key.toDTO()).toStrictEqual(metadataKey.toDTO());
        expect(result?.targetId).toBeUndefined();
    }, 600000);

    it("Verify account metal", () => {
        const result = MetalService.verifyMetadataKey(metadataKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap account metal", async () => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const txs = await metalService.createScrapTxs(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, sourceAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Account, { target: targetAccount });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Forge mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalService.createForgeTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            testData,
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalService.calculateMetalId(
            MetadataType.Mosaic,
            targetAccount.address,
            creatorAccount.address,
            mosaicId,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${Convert.uint8ToUtf8(additive)}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, creatorAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const result = await metalService.fetchByMetalId(metalId);

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(testData.buffer);
        expect(result?.type).toBe(MetadataType.Mosaic);
        expect(result?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(result?.targetAddress.toDTO()).toStrictEqual(creatorAccount.address.toDTO());
        expect(result?.key.toDTO()).toStrictEqual(metadataKey.toDTO());
        expect(result?.targetId?.toHex()).toBe(mosaicId.toHex());
    }, 600000);

    it("Verify mosaic metal", () => {
        const result = MetalService.verifyMetadataKey(metadataKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const txs = await metalService.createScrapTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, creatorAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Mosaic, { targetId: mosaicId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Forge namespace metal", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs, additive } = await metalService.createForgeTxs(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            ownerAccount.publicAccount,
            namespaceId,
            testData,
        );

        expect(key).toBeDefined();
        assert(key);

        metadataKey = key;
        metalAdditive = additive;
        metalId = MetalService.calculateMetalId(
            MetadataType.Namespace,
            targetAccount.address,
            ownerAccount.address,
            namespaceId,
            metadataKey,
        );
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${Convert.uint8ToUtf8(additive)}`);
        console.log(`metalId=${metalId}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, ownerAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Fetch and decode namespace metal", async () => {
        const { signerAccount: ownerAccount } = await SymbolTest.getNamedAccounts();
        const result = await metalService.fetchByMetalId(metalId);

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
        const txs = await metalService.createScrapTxs(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            ownerAccount.publicAccount,
            namespaceId,
            metadataKey,
        );

        expect(txs).toBeDefined();

        assert(txs);
        console.log(`txs.length=${txs?.length}`);

        const errors = await doBatches(txs, ownerAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();

        metadataPool = await symbolService.searchMetadata(MetadataType.Namespace, { targetId: namespaceId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeFalsy();
    }, 600000);

    it("Destroy mosaic metal", async () => {
        const { signerAccount: creatorAccount } = await SymbolTest.getNamedAccounts();
        const { txs: forgeTxs, additive } = await metalService.createForgeTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            testData,
        );
        await doBatches(forgeTxs, creatorAccount, [ targetAccount ]);

        const destroyTxs = await metalService.createDestroyTxs(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            creatorAccount.publicAccount,
            mosaicId,
            testData,
            additive,
        );
        const errors = await doBatches(destroyTxs, creatorAccount, [ targetAccount ]);

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
            []
        ));

        const metadataPool = await symbolService.searchMetadata(MetadataType.Mosaic, {
            source: signerAccount.publicAccount,
            target: signerAccount.publicAccount,
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

        const txs1 = await metalService.createScrapTxs(
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

        const txs2 = await metalService.createScrapTxs(
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
            []
        ));

        const metadataPool = await symbolService.searchMetadata(MetadataType.Namespace, {
            source: signerAccount.publicAccount,
            target: signerAccount.publicAccount,
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

        const txs1 = await metalService.createScrapTxs(
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

        const txs2 = await metalService.createScrapTxs(
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
});