import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import { ForgeCLI } from "../cli";
import assert from "assert";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import {Account, Convert, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {MetalService} from "../services";


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

    it("Estimation of Forge Metal", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await ForgeCLI.main([
            "-e",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "-c",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("estimated");
        expect(output?.type).toBe(MetadataType.Account);

    }, 600000);

    it("Forge Metal into Account", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "--cosigner", targetAccount.privateKey,
            "-c",
            "-v",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Account);

        assert(output?.metalId);
        await MetalTest.scrapMetal(output?.metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Forge Metal into Mosaic", async () => {
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
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Mosaic);

        assert(output?.metalId);
        await MetalTest.scrapMetal(output?.metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Forge Metal into Namespace", async () => {
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
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Namespace);

        assert(output?.metalId);
        await MetalTest.scrapMetal(output.metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Forge Metal into Account with Alt additive", async () => {
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
            inputFile,
        ]);

        expect(outputNoAdditive?.metalId).toBeDefined();
        expect(outputNoAdditive?.additive).toBe("0000");

        // Forge metal with alt additive
        const additive = Convert.uint8ToUtf8(MetalService.generateRandomAdditive());
        const outputWithAdditive = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", signerAccount.publicKey,
            "-t", targetAccount.publicKey,
            "--tgt-priv-key", targetAccount.privateKey,
            "-c",
            "-v",
            "--additive", additive,
            inputFile,
        ]);

        expect(outputWithAdditive?.metalId).toBeDefined();
        expect(outputWithAdditive?.metalId).not.toBe(outputNoAdditive?.metalId);
        expect(outputWithAdditive?.additive).toBe(additive);
        expect(outputWithAdditive?.type).toBe(MetadataType.Account);

        assert(outputWithAdditive?.metalId);
        await MetalTest.scrapMetal(outputWithAdditive.metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);
});