import "./env";
import assert from "assert";
import fs from "fs";
import { Account, Convert, MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { FetchCLI } from "../cli";
import { ReinforceCLIV1, ScrapCLIV1 } from "../cli/compat";
import { MetalService } from "../services/compat";
import { initTestEnv, MetalTest, SymbolTest } from "./utils";
import compareBatches = MetalTest.compareBatches;


describe("Compatibility of V1", () => {
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

    it("Fetch V1 Metal", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetalV1(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
            MetalService.generateRandomAdditive(),
        );

        const output = await FetchCLI.main([
            "--no-save",
            metalId,
        ]);

        expect(output?.key?.toDTO()).toStrictEqual(key.toDTO());
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId).toBeUndefined();
        expect(output?.payload.buffer).toStrictEqual(testData.buffer);

        assert(metalId);
        await MetalTest.scrapMetal(metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 6000000);

    it("Reinforce (Scrap) V1 Metal", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, additive } = await MetalTest.forgeMetalV1(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
            MetalService.generateRandomAdditive(),
        );

        const scrapOutput = await ScrapCLIV1.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-o", outputFile,
            metalId,
        ]);

        expect(fs.existsSync(outputFile)).toBeTruthy();
        expect(scrapOutput?.additive).toBe(Convert.uint8ToUtf8(additive));

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLIV1.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        compareBatches(estimateOutput?.batches, scrapOutput?.batches);
        expect(estimateOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(estimateOutput?.command).toBe("scrap");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.totalFee.toDTO()).toStrictEqual(scrapOutput?.totalFee.toDTO());
        expect(estimateOutput?.type).toBe(scrapOutput?.type);
        expect(estimateOutput?.sourcePubAccount).toStrictEqual(scrapOutput?.sourcePubAccount);
        expect(estimateOutput?.targetPubAccount).toStrictEqual(scrapOutput?.targetPubAccount);
        expect(estimateOutput?.key?.toDTO()).toStrictEqual(scrapOutput?.key?.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(scrapOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(scrapOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(scrapOutput?.additive);
        expect(estimateOutput?.signerPubAccount).toStrictEqual(scrapOutput?.signerPubAccount);

        const reinforceOutput = await ReinforceCLIV1.main([
            "-a",
            "-f",
            "--priv-key", targetAccount.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(reinforceOutput?.command).toBe("scrap");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 60000000);

});
