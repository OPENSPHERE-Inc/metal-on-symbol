import "./env";
import assert from "assert";
import fs from "fs";
import mime from "mime";
import path from "path";
import { Account, MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { ScrapCLI } from "../cli";
import { MetalSeal, MetalServiceV2 } from "../services";
import { initTestEnv, MetalTest, SymbolTest } from "./utils";


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
        const generatedAdditive = MetalServiceV2.generateRandomAdditive();
        const { metalId, additive } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
            generatedAdditive,
            new MetalSeal(
                testData.length,
                mime.getType(inputFile) ?? undefined,
                path.basename(inputFile),
                "comment123"
            ).stringify(),
        );

        const estimateOutput = await ScrapCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "--tgt-pub-key", targetAccount.publicKey,
            "-i", inputFile,
            "--additive", String(additive),
            "--seal", "3",
            "--comment", "comment123",
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourcePubAccount.toDTO()).toStrictEqual(signerAccount.publicAccount.toDTO());
        expect(estimateOutput?.targetPubAccount.toDTO()).toStrictEqual(targetAccount.publicAccount.toDTO());
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(additive).toStrictEqual(generatedAdditive);
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await ScrapCLI.main([
            "--force",
            "--priv-key", signerAccount.privateKey,
            "--tgt-priv-key", targetAccount.privateKey,
            "--in", inputFile,
            "--additive", String(additive),
            "--parallels", "1",
            "--fee-ratio", "0.35",
            "-S3",
            "--comment", "comment123",
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);
});
