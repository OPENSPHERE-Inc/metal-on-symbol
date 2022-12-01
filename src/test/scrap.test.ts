import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, Convert, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import fs from "fs";
import { main as scrapMain } from "../cli/scrap/main";
import {MetalService} from "../services/metal";


describe("Scrap CLI", () => {
    let inputFile: string;
    let target: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let testData: Buffer;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;
        testData = fs.readFileSync(process.env.TEST_INPUT_FILE);

        const assets = await MetalTest.generateAssets();
        target = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    it("Account Metal via metal ID", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signer1.publicAccount,
            target.publicAccount,
            undefined,
            testData,
            signer1,
            [ target ],
        );

        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            metalId,
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourceAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "--tgt-priv-key", target.privateKey,
            metalId,
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Mosaic Metal via metal ID", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId } = await MetalTest.forgeMetal(
            MetadataType.Mosaic,
            target.publicAccount,
            signer1.publicAccount,
            mosaicId,
            testData,
            signer1,
            [ target ],
        );

        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            metalId,
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Mosaic);
        expect(estimateOutput?.sourceAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "--src-priv-key", target.privateKey,
            metalId,
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Namespace Metal via metal ID", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId } = await MetalTest.forgeMetal(
            MetadataType.Namespace,
            target.publicAccount,
            signer1.publicAccount,
            namespaceId,
            testData,
            signer1,
            [ target ],
        );

        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            metalId,
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Namespace);
        expect(estimateOutput?.sourceAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.mosaicId).toBeUndefined()
        expect(estimateOutput?.namespaceId?.toHex()).toBe(namespaceId.toHex());
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "--src-priv-key", target.privateKey,
            metalId,
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Account Metal via metadata key", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { key, metalId } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signer1.publicAccount,
            target.publicAccount,
            undefined,
            testData,
            signer1,
            [ target ],
        );

        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            "-k", key.toHex(),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourceAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "--tgt-priv-key", target.privateKey,
            "-k", key.toHex(),
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Mosaic Metal via metadata key", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Mosaic,
            target.publicAccount,
            signer1.publicAccount,
            mosaicId,
            testData,
            signer1,
            [ target ],
        );

        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "--src-pub-key", target.publicKey,
            "-m", mosaicId.toHex(),
            "-k", key.toHex(),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Mosaic);
        expect(estimateOutput?.sourceAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "--src-priv-key", target.privateKey,
            "--mosaic", mosaicId.toHex(),
            "-k", key.toHex(),
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Namespace Metal via metadata key", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Namespace,
            target.publicAccount,
            signer1.publicAccount,
            namespaceId,
            testData,
            signer1,
            [ target ],
        );

        assert(namespaceId.fullName);
        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            "-n", namespaceId.fullName,
            "-k", key.toHex(),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Namespace);
        expect(estimateOutput?.sourceAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.mosaicId).toBeUndefined()
        expect(estimateOutput?.namespaceId?.toHex()).toBe(namespaceId.toHex());
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "--src-priv-key", target.privateKey,
            "--namespace", namespaceId.fullName,
            "--key", key.toHex(),
        ]);

        expect(scrapOutput?.metalId).toBeDefined();
        expect(scrapOutput?.metalId).toBe(metalId);
        expect(scrapOutput?.status).toBe("scrapped");
    }, 6000000);

    it("Account Metal via input file with Alt additive", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const generatedAdditiveBytes = MetalService.generateRandomAdditive();
        const { metalId, additiveBytes } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signer1.publicAccount,
            target.publicAccount,
            undefined,
            testData,
            signer1,
            [ target ],
            generatedAdditiveBytes,
        );

        const estimateOutput = await scrapMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "--tgt-pub-key", target.publicKey,
            "-i", inputFile,
            "--additive", Convert.uint8ToUtf8(additiveBytes),
        ]);

        expect(estimateOutput?.metalId).toBeDefined();
        expect(estimateOutput?.metalId).toBe(metalId);
        expect(estimateOutput?.type).toBe(MetadataType.Account);
        expect(estimateOutput?.sourceAccount).toStrictEqual(signer1.publicAccount);
        expect(estimateOutput?.targetAccount).toStrictEqual(target.publicAccount);
        expect(estimateOutput?.mosaicId).toBeUndefined();
        expect(estimateOutput?.namespaceId).toBeUndefined();
        expect(additiveBytes).toStrictEqual(generatedAdditiveBytes);
        expect(estimateOutput?.status).toBe("estimated");

        const scrapOutput = await scrapMain([
            "--force",
            "--priv-key", signer1.privateKey,
            "--tgt-priv-key", target.privateKey,
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