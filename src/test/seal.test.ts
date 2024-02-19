import "./env";
import { SignedAggregateTx } from "@opensphere-inc/symbol-service";
import assert from "assert";
import fs from "fs";
import moment from "moment/moment";
import path from "path";
import { Account, InnerTransaction, MetadataType, MosaicId, NamespaceId, UInt64 } from "symbol-sdk";
import { MetalSeal, MetalServiceV2 } from "../services";
import { initTestEnv, metalServiceV2, MetalTest, SymbolTest } from "./utils";


describe("Metal seal", () => {
    let inputFile: string;
    let outputFile: string;
    let targetAccount: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let testData: Uint8Array;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;
        assert(process.env.TEST_OUTPUT_FILE);
        outputFile = process.env.TEST_OUTPUT_FILE;
        testData = fs.readFileSync(process.env.TEST_INPUT_FILE);

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    it("Construct (full)", () => {
        const seal = new MetalSeal(12345, "application/octet-stream", "example.jpg");
        expect(seal.stringify()).toBe(`["${MetalSeal.SCHEMA}",12345,"application/octet-stream","example.jpg"]`);

        const parsed = MetalSeal.parse(seal.stringify());
        expect(parsed.schema).toBe(seal.schema);
        expect(parsed.length).toBe(seal.length);
        expect(parsed.mimeType).toBe(seal.mimeType);
        expect(parsed.name).toBe(seal.name);
    });

    it("Construct (length,mimeType)", () => {
        const seal = new MetalSeal(12345, "application/octet-stream");
        expect(seal.stringify()).toBe(`["${MetalSeal.SCHEMA}",12345,"application/octet-stream"]`);

        const parsed = MetalSeal.parse(seal.stringify());
        expect(parsed.schema).toBe(seal.schema);
        expect(parsed.length).toBe(seal.length);
        expect(parsed.mimeType).toBe(seal.mimeType);
        expect(parsed.name).toBe(seal.name);
    });

    it("Construct (length,name)", () => {
        const seal = new MetalSeal(12345, undefined, "example.jpg");
        expect(seal.stringify()).toBe(`["${MetalSeal.SCHEMA}",12345,null,"example.jpg"]`);

        const parsed = MetalSeal.parse(seal.stringify());
        expect(parsed.schema).toBe(seal.schema);
        expect(parsed.length).toBe(seal.length);
        expect(parsed.mimeType).toBe(seal.mimeType);
        expect(parsed.name).toBe(seal.name);
    });

    it("Construct (length)", () => {
        const seal = new MetalSeal(12345);
        expect(seal.stringify()).toBe(`["${MetalSeal.SCHEMA}",12345]`);

        const parsed = MetalSeal.parse(seal.stringify());
        expect(parsed.schema).toBe(seal.schema);
        expect(parsed.length).toBe(seal.length);
        expect(parsed.mimeType).toBe(seal.mimeType);
        expect(parsed.name).toBe(seal.name);
    });

    it("Parse error (Malformed)", () => {
        expect(() => {
            MetalSeal.parse(`test`);
        }).toThrowError();
        expect(() => {
            MetalSeal.parse(`["test"]`);
        }).toThrowError("Malformed seal JSON.");
    });

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

    const forgeWithSeal = async (payload: Uint8Array, seal: MetalSeal) => {
        const { signerAccount: sourceAccount } = await SymbolTest.getNamedAccounts();
        const { key, txs } = await metalServiceV2.createForgeTxs(
            MetadataType.Account,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            payload,
            MetalServiceV2.generateRandomAdditive(),
            seal.stringify(),
        );

        console.debug(`metadataKey=${key.toHex()}`);


        const metalId = MetalServiceV2.calculateMetalId(
            MetadataType.Account,
            sourceAccount.address,
            targetAccount.address,
            undefined,
            key,
        );

        const errors = await doBatches(txs, sourceAccount, [ targetAccount ]);

        expect(errors).toBeUndefined();

        const result = await metalServiceV2.fetchByMetalId(metalId);
        const fetchedSeal = result.text ? MetalSeal.parse(result.text) : undefined;

        expect(result).toBeDefined();
        expect(result?.payload.buffer).toStrictEqual(payload.buffer);
        expect(fetchedSeal).toBeDefined();
        expect(fetchedSeal?.schema).toBe(seal.schema);
        expect(fetchedSeal?.mimeType).toBe(seal.mimeType);
        expect(fetchedSeal?.length).toBe(seal.length);
        expect(fetchedSeal?.name).toBe(seal.name);

        await MetalTest.scrapMetal(
            metalId,
            sourceAccount.publicAccount,
            targetAccount.publicAccount,
            sourceAccount,
            [ targetAccount ]
        );
    };

    it("Forge with seal", async () => {
        await forgeWithSeal(
            testData,
            new MetalSeal(
                testData.length,
                "image/jpg",
                path.basename(inputFile),
            )
        );
    }, 600000);
});
