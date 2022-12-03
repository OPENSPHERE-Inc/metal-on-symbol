import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, Convert, MosaicId, NamespaceId} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import {ForgeCLI} from "../cli";
import {ReinforceCLI} from "../cli";
import {ScrapCLI} from "../cli";
import fs from "fs";
import {MetalService} from "../services";


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
        expect(estimateOutput?.payload).toStrictEqual(forgeOutput?.payload);
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
});