import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import { main as forgeMain } from "../cli/forge/main";
import assert from "assert";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import {Account, Convert, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {MetalService} from "../services/metal";


describe("Forge CLI", () => {
    let inputFile: string;
    let target: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;

        const assets = await MetalTest.generateAssets();
        target = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;
    }, 600000);

    it("Estimation of Forge Metal", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const output = await forgeMain([
            "-e",
            "--priv-key", signer1.privateKey,
            "-s", signer1.publicKey,
            "-t", target.publicKey,
            "-c",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("estimated");
        expect(output?.type).toBe(MetadataType.Account);

    }, 600000);

    it("Forge Metal into Account", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const output = await forgeMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "-s", signer1.publicKey,
            "-t", target.publicKey,
            "--cosigner", target.privateKey,
            "-c",
            "-v",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Account);

        assert(output?.metalId);
        await MetalTest.scrapMetal(output?.metalId, signer1.publicAccount, target.publicAccount, signer1, [ target ]);
    }, 600000);

    it("Forge Metal into Mosaic", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const output = await forgeMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            "-t", signer1.publicKey,
            "--mosaic", mosaicId.toHex(),
            "--cosigner", target.privateKey,
            "-c",
            "-v",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Mosaic);

        assert(output?.metalId);
        await MetalTest.scrapMetal(output?.metalId, target.publicAccount, signer1.publicAccount, signer1, [ target ]);
    }, 600000);

    it("Forge Metal into Namespace", async () => {
        assert(namespaceId.fullName);

        const { signer1 } = await SymbolTest.getNamedAccounts();
        const output = await forgeMain([
            "--force",
            "--priv-key", signer1.privateKey,
            "--src-pub-key", target.publicKey,
            "--tgt-pub-key", signer1.publicKey,
            "--namespace", namespaceId.fullName,
            "--src-priv-key", target.privateKey,
            "--check-collision",
            "--verify",
            "--parallels", "1",
            inputFile,
        ]);

        expect(output?.metalId).toBeDefined();
        expect(output?.status).toBe("forged");
        expect(output?.type).toBe(MetadataType.Namespace);

        assert(output?.metalId);
        await MetalTest.scrapMetal(output.metalId, target.publicAccount, signer1.publicAccount, signer1, [ target ]);
    }, 600000);

    it("Forge Metal into Account with Alt additive", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        // Estimate metal ID without no additive
        const outputNoAdditive = await forgeMain([
            "--estimate",
            "--priv-key", signer1.privateKey,
            "-s", signer1.publicKey,
            "-t", target.publicKey,
            "--cosigner", target.privateKey,
            "-c",
            "--fee-ratio", "0.35",
            inputFile,
        ]);

        expect(outputNoAdditive?.metalId).toBeDefined();
        expect(outputNoAdditive?.additive).toBe("0000");

        // Forge metal with alt additive
        const additive = Convert.uint8ToUtf8(MetalService.generateRandomAdditive());
        const outputWithAdditive = await forgeMain([
            "-f",
            "--priv-key", signer1.privateKey,
            "-s", signer1.publicKey,
            "-t", target.publicKey,
            "--tgt-priv-key", target.privateKey,
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
        await MetalTest.scrapMetal(outputWithAdditive.metalId, signer1.publicAccount, target.publicAccount, signer1, [ target ]);
    }, 600000);
});