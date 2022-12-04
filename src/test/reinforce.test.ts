import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {
    Account,
    Convert,
    Deadline,
    MosaicId,
    NamespaceId,
    TransferTransaction,
    Mosaic,
    UInt64,
    PlainMessage
} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import {ForgeCLI, ScrapCLI} from "../cli";
import {ReinforceCLI} from "../cli";
import fs from "fs";
import {MetalService, SymbolService} from "../services";
import {writeIntermediateFile} from "../cli/intermediate";



describe("Reinforce CLI", () => {
    let inputFile: string;
    let outputFile: string;
    let target: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let metalId: string;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;
        assert(process.env.TEST_OUTPUT_FILE);
        outputFile = process.env.TEST_OUTPUT_FILE;

        const assets = await MetalTest.generateAssets();
        target = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    afterEach(() => {
        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
        }
    });

    it("Forge Account Metal", async() => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const forgeOutput = await ForgeCLI.main([
            "-f",
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            "-c",
            "--additive", Convert.uint8ToUtf8(MetalService.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        expect(forgeOutput?.metalId).toBeDefined();
        expect(fs.existsSync(outputFile)).toBeTruthy();

        assert(forgeOutput?.metalId);
        metalId = forgeOutput?.metalId;

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLI.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        expect(estimateOutput?.metalId).toBe(forgeOutput?.metalId);
        expect(estimateOutput?.command).toBe("forge");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.payload.buffer).toStrictEqual(forgeOutput?.payload.buffer);
        expect(estimateOutput?.totalFee).toStrictEqual(forgeOutput?.totalFee);
        expect(estimateOutput?.batches).toStrictEqual(forgeOutput?.batches);
        expect(estimateOutput?.type).toBe(forgeOutput?.type);
        expect(estimateOutput?.sourceAccount).toStrictEqual(forgeOutput?.sourceAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(forgeOutput?.targetAccount);
        expect(estimateOutput?.key).toStrictEqual(forgeOutput?.key);
        expect(estimateOutput?.mosaicId?.toHex()).toBe(forgeOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(forgeOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(forgeOutput?.additive);
        expect(estimateOutput?.signerAccount).toStrictEqual(forgeOutput?.signerAccount);

        const reinforceOutput = await ReinforceCLI.main([
            "-a",
            "-f",
            "--cosigner", target.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(forgeOutput?.metalId);
        expect(reinforceOutput?.command).toBe("forge");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 600000);

    it("Scrap Account Metal", async() => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            "-o", outputFile,
            metalId,
        ]);

        expect(fs.existsSync(outputFile)).toBeTruthy();

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLI.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        expect(estimateOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(estimateOutput?.command).toBe("scrap");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.totalFee).toStrictEqual(scrapOutput?.totalFee);
        expect(estimateOutput?.batches).toStrictEqual(scrapOutput?.batches);
        expect(estimateOutput?.type).toBe(scrapOutput?.type);
        expect(estimateOutput?.sourceAccount).toStrictEqual(scrapOutput?.sourceAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(scrapOutput?.targetAccount);
        expect(estimateOutput?.key).toStrictEqual(scrapOutput?.key);
        expect(estimateOutput?.mosaicId?.toHex()).toBe(scrapOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(scrapOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(scrapOutput?.additive);
        expect(estimateOutput?.signerAccount).toStrictEqual(scrapOutput?.signerAccount);

        const reinforceOutput = await ReinforceCLI.main([
            "-a",
            "-f",
            "--priv-key", target.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(reinforceOutput?.command).toBe("scrap");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 600000);

    it("Reject manipulated intermediate TXs", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const forgeOutput1 = await ForgeCLI.main([
            "-f",
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            "-c",
            "--additive", Convert.uint8ToUtf8(MetalService.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        const forgeOutput2 = await ForgeCLI.main([
            "-f",
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            "-c",
            "--additive", Convert.uint8ToUtf8(MetalService.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        // Mix each outputs
        assert(forgeOutput1);
        assert(forgeOutput2);
        writeIntermediateFile({
            ...forgeOutput1,
            batches: [ ...forgeOutput1.batches, ...forgeOutput2.batches ],
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Intermediate TXs validation failed.");

        // Manipulated sourceAccount
        writeIntermediateFile({
            ...forgeOutput1,
            sourceAccount: target.publicAccount,
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Intermediate TXs validation failed.");

        // Manipulated targetAccount
        writeIntermediateFile({
            ...forgeOutput1,
            targetAccount: signer1.publicAccount,
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Intermediate TXs validation failed.");

        // Manipulated mosaicId
        const forgeOutput3 = await ForgeCLI.main([
            "-f",
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            "-m", mosaicId.toHex(),
            "-c",
            "--additive", Convert.uint8ToUtf8(MetalService.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        assert(forgeOutput3);
        writeIntermediateFile({
            ...forgeOutput3,
            mosaicId: new MosaicId("123456789ABCDEF0"),
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Intermediate TXs validation failed.");

        // Manipulated namespaceId
        const forgeOutput4 = await ForgeCLI.main([
            "-f",
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            "-n", namespaceId.toHex(),
            "-c",
            "--additive", Convert.uint8ToUtf8(MetalService.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        assert(forgeOutput4);
        writeIntermediateFile({
            ...forgeOutput4,
            namespaceId: new NamespaceId("manipulated-namespace"),
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Intermediate TXs validation failed.");

        // Contamination
        const { epochAdjustment, networkCurrencyMosaicId,networkType } = await SymbolService.getNetwork();
        const txs = [
            TransferTransaction.create(
                Deadline.create(epochAdjustment),
                signer1.address,
                [ new Mosaic(networkCurrencyMosaicId, UInt64.fromNumericString("10000000000") ) ],
                PlainMessage.create("I stole your money"),
                networkType,
            ).toAggregate(target.publicAccount)
        ];
        const batches = await SymbolService.buildSignedAggregateCompleteTxBatches(txs, signer1);

        writeIntermediateFile({
            ...forgeOutput1,
            batches: [ ...forgeOutput1.batches, ...batches ],
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Intermediate TXs validation failed.");
    }, 600000);
});