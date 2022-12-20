import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, Convert, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import fs from "fs";
import {ScrapCLI } from "../cli";
import {MetalService} from "../services";


describe("Scrap CLI", () => {
    let inputFile: string;
    let targetAccount: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let testData: Uint8Array;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;
        testData = fs.readFileSync(process.env.TEST_INPUT_FILE);

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    it("Account Metal via metal ID", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            metalId,
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--tgt-priv-key", targetAccount.privateKey,
            metalId,
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Mosaic Metal via metal ID", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId } = await MetalTest.forgeMetal(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            signerAccount.publicAccount,
            mosaicId,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            metalId,
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Mosaic);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--src-priv-key", targetAccount.privateKey,
            metalId,
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Namespace Metal via metal ID", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId } = await MetalTest.forgeMetal(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            signerAccount.publicAccount,
            namespaceId,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            metalId,
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Namespace);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId).toBeUndefined()
        expect(estimateOutput?.namespaceId?.toHex()).toBe(namespaceId.toHex());
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--src-priv-key", targetAccount.privateKey,
            metalId,
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Account Metal via metadata key", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { key, metalId } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-k", key.toHex(),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--tgt-priv-key", targetAccount.privateKey,
            "-k", key.toHex(),
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Mosaic Metal via metadata key", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Mosaic,
            targetAccount.publicAccount,
            signerAccount.publicAccount,
            mosaicId,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "--src-pub-key", targetAccount.publicKey,
            "-m", mosaicId.toHex(),
            "-k", key.toHex(),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Mosaic);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--src-priv-key", targetAccount.privateKey,
            "--mosaic", mosaicId.toHex(),
            "-k", key.toHex(),
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Namespace Metal via metadata key", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Namespace,
            targetAccount.publicAccount,
            signerAccount.publicAccount,
            namespaceId,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        assert(namespaceId.fullName);
        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            "-n", namespaceId.fullName,
            "-k", key.toHex(),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Namespace);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId).toBeUndefined()
        expect(estimateOutput?.namespaceId?.toHex()).toBe(namespaceId.toHex());
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--src-priv-key", targetAccount.privateKey,
            "--namespace", namespaceId.fullName,
            "--key", key.toHex(),
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Account Metal via input file with Alt additive", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const generatedAdditiveBytes = MetalService.generateRandomAdditive();
        const { metalId, additiveBytes } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
            generatedAdditiveBytes,
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "--tgt-pub-key", targetAccount.publicKey,
            "-i", inputFile,
            "--additive", Convert.uint8ToUtf8(additiveBytes),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(additiveBytes).toStrictEqual(generatedAdditiveBytes);
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "--force",
            "--priv-key", signerAccount.privateKey,
            "--tgt-priv-key", targetAccount.privateKey,
            "--in", inputFile,
            "--additive", Convert.uint8ToUtf8(additiveBytes),
            "--parallels", "1",
            "--fee-ratio", "0.35",
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);
});