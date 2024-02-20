import "./env";
import assert from "assert";
import fs from "fs";
import mime from "mime";
import path from "path";
import { Account, MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { ForgeCLI } from "../cli";
import { MetalSeal, MetalServiceV2 } from "../services";
import { initTestEnv, MetalTest, SymbolTest } from "./utils";


describe("Forge CLI", () => {
    let inputFile: string;
    let targetAccount: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    it("Estimation of Forge Metal with seal level 1", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await ForgeCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "-c",
            "--seal", "1",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("estimated");
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.text).toBe(
            new MetalSeal(
                fs.statSync(inputFile).size,
            ).stringify()
        );
    }, 600000);

    it("Forge Metal into Account with seal level 2", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "--cosigner", targetAccount.privateKey,
            "-c",
            "-v",
            "-S2",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.text).toBe(
            new MetalSeal(
                fs.statSync(inputFile).size,
                mime.getType(inputFile) || undefined
            ).stringify()
        );

        assert(output?.metalId);
        await MetalTest.scrapMetal(output?.metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Forge Metal into Mosaic, with no seal", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            "-t", signerAccount.publicKey,
            "--mosaic", mosaicId.toHex(),
            "--cosigner", targetAccount.privateKey,
            "-c",
            "-v",
            "-S0",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Mosaic);
        expect(output?.text).toBeUndefined();

        assert(output?.metalId);
        await MetalTest.scrapMetal(output?.metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Forge Metal into Namespace with seal level 3", async () => {
        assert(namespaceId.fullName);

        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await ForgeCLI.main([
            "--force",
            "--priv-key", signerAccount.privateKey,
            "--src-pub-key", targetAccount.publicKey,
            "--tgt-pub-key", signerAccount.publicKey,
            "--namespace", namespaceId.fullName,
            "--src-priv-key", targetAccount.privateKey,
            "--check-collision",
            "--verify",
            "--parallels", "1",
            "-S3",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.text).toBe(
            new MetalSeal(
                fs.statSync(inputFile).size,
                mime.getType(inputFile) || undefined,
                path.basename(inputFile)
            ).stringify()
        );

        assert(output?.metalId);
        await MetalTest.scrapMetal(output.metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Forge Metal into Account with Alt additive & seal comment", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        // Estimate metal ID without no additive
        const outputNoAdditive = await ForgeCLI.main([
            "--estimate",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "--cosigner", targetAccount.privateKey,
            "-c",
            "--fee-ratio", "0.35",
            "--comment", "comment123",
            inputFile,
        ]);

        expect(outputNoAdditive?.metalId).toBeDefined();
        expect(outputNoAdditive?.additive).toBe(0);
        expect(outputNoAdditive?.text).toBe(
            new MetalSeal(
                fs.statSync(inputFile).size,
                mime.getType(inputFile) || undefined,
                undefined,
                "comment123"
            ).stringify()
        );

        // Forge metal with alt additive
        const additive = MetalServiceV2.generateRandomAdditive();
        const outputWithAdditive = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "--tgt-priv-key", targetAccount.privateKey,
            "-c",
            "-v",
            "--additive", String(additive),
            "--seal", "0",
            "--comment", "comment123",
            inputFile,
        ]);

        expect(outputWithAdditive?.metalId).toBeDefined();
        expect(outputWithAdditive?.metalId).not.toBe(outputNoAdditive?.metalId);
        expect(outputWithAdditive?.additive).toBe(additive);
        expect(outputWithAdditive?.type).toBe(MetadataType.Account);
        expect(outputWithAdditive?.text).toBeUndefined();

        assert(outputWithAdditive?.metalId);
        await MetalTest.scrapMetal(outputWithAdditive.metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);
});
