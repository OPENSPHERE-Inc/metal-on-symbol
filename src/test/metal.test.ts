import dotenv from "dotenv";
import {initTestEnv, SymbolTest} from "./utils";
import {MetalService} from "../services/metal";
import fs from "fs";
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
import {SymbolService} from "../services/symbol";
import {toXYM} from "../libs/utils";
import Long from "long";
import assert from "assert";
import moment from "moment";
import {v4 as uuidv4} from "uuid";

dotenv.config({ path: './.env.test' });


describe("MetalService", () => {
    let target: Account;
    let metalKey: UInt64;
    let metalAdditive: string;
    let testData: Buffer;
    let dataChunks: number;
    let batchSize: number;
    let maxParallels: number;
    let metadataPool: Metadata[];
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.BATCH_SIZE);
        assert(process.env.MAX_PARALLELS);
        batchSize = Number(process.env.BATCH_SIZE);
        maxParallels = Number(process.env.MAX_PARALLELS);

        assert(process.env.TEST_PNG_FILE);
        testData = fs.readFileSync(process.env.TEST_PNG_FILE);
        dataChunks = Math.ceil(testData.toString("base64").length / 1000);

        // Generate account
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { networkType } = await SymbolService.getNetwork();
        target = Account.generateNewAccount(networkType);
        console.log(`target.address=${target.address.plain()}`);

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
        mosaicId = mosaicDefinition.mosaicId;
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
        namespaceId = new NamespaceId(namespaceName);
        console.log(`namespaceId=${namespaceId.toHex()}`);
    }, 600000);

    const doBatches = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners: Account[],
    ) => {
        const start = moment.now();
        const errors = await SymbolTest.doAggregateTxBatches(
            txs,
            signer,
            cosigners,
            batchSize,
            maxParallels,
            (batches, totalFee) => {
                console.log(`totalFee=${toXYM(Long.fromString(totalFee.toString()))}`);
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
            MetalService.generateMetadataKey("test1keyhohohogehoge"),
            mosaicId,
        );
        console.log(`metadataHash=${metadataHash}`);

        const metalId = MetalService.calculateMetalId(
            MetadataType.Mosaic,
            source.address,
            target.address,
            MetalService.generateMetadataKey("test1keyhohohogehoge"),
            mosaicId,
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

        metalKey = key;
        metalAdditive = additive;
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${additive}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, source, [ target ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Decode account metal", async () => {
        metadataPool = await SymbolService.searchMetadata(MetadataType.Account, { target });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeTruthy();

        const payloadBase64 = MetalService.decodeAsBase64(metalKey, metadataPool);

        expect(payloadBase64).toBeTruthy();
        expect(payloadBase64).toBe(testData.toString("base64"));
    }, 600000);

    it("Verify account metal", () => {
        const result = MetalService.verifyMetadataKey(metalKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap account metal", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();
        const txs = await MetalService.createScrapTxs(
            MetadataType.Account,
            source.publicAccount,
            target.publicAccount,
            metalKey,
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

        metalKey = key;
        metalAdditive = additive;
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${additive}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, creator, [ target ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Decode mosaic metal", async () => {
        metadataPool = await SymbolService.searchMetadata(MetadataType.Mosaic, { targetId: mosaicId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeTruthy();

        const payloadBase64 = MetalService.decodeAsBase64(metalKey, metadataPool);

        expect(payloadBase64).toBeTruthy();
        expect(payloadBase64).toBe(testData.toString("base64"));
    }, 600000);

    it("Verify mosaic metal", () => {
        const result = MetalService.verifyMetadataKey(metalKey, testData, metalAdditive);

        expect(result).toBeTruthy();
    });

    it("Scrap mosaic metal", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const txs = await MetalService.createScrapTxs(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            metalKey,
            mosaicId,
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

        metalKey = key;
        metalAdditive = additive;
        console.log(`key=${key?.toHex()}`);
        console.log(`additive=${additive}`);
        console.log(`txs.length=${txs.length}`);

        expect((txs[0] as AccountMetadataTransaction).scopedMetadataKey).toBe(key);
        expect(txs.length).toBe(dataChunks);

        const errors = await doBatches(txs, owner, [ target ]);

        expect(errors).toBeUndefined();
    }, 600000);

    it("Decode namespace metal", async () => {
        metadataPool = await SymbolService.searchMetadata(MetadataType.Namespace, { targetId: namespaceId });
        console.log(`metadataPool.length=${metadataPool.length}`);

        expect(metadataPool.length).toBeTruthy();

        const payloadBase64 = MetalService.decodeAsBase64(metalKey, metadataPool);

        expect(payloadBase64).toBeTruthy();
        expect(payloadBase64).toBe(testData.toString("base64"));
    }, 600000);

    it("Scrap namespace metal", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();
        const txs = await MetalService.createScrapTxs(
            MetadataType.Namespace,
            target.publicAccount,
            owner.publicAccount,
            metalKey,
            namespaceId,
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
});