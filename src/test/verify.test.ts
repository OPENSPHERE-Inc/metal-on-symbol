import "./env";
import {Account, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import fs from "fs";
import {VerifyCLI} from "../cli";


describe("Verify CLI", () => {
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
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const output = await VerifyCLI.main([
            metalId,
            inputFile,
        ]);

        expect(output?.key?.toDTO()).toStrictEqual(key.toDTO());
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Mosaic Metal via metal ID", async () => {
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

        const output = await VerifyCLI.main([
            metalId,
            inputFile,
        ]);

        expect(output?.key?.toDTO()).toStrictEqual(key.toDTO());
        expect(output?.type).toBe(MetadataType.Mosaic);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Namespace Metal via metal ID", async () => {
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

        const output = await VerifyCLI.main([
            metalId,
            inputFile,
        ]);

        expect(output?.key?.toDTO()).toStrictEqual(key.toDTO());
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId?.toHex()).toBe(namespaceId.toHex());

        assert(metalId);
        await MetalTest.scrapMetal(metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

    it("Account Metal via metadata key", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signerAccount.publicAccount,
            targetAccount.publicAccount,
            undefined,
            testData,
            signerAccount,
            [ targetAccount ],
        );

        const output = await VerifyCLI.main([
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-k", key.toHex(),
            inputFile,
        ]);

        expect(output?.metalId).toBe(metalId);
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, signerAccount.publicAccount, targetAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

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

        const output = await VerifyCLI.main([
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            "-m", mosaicId.toHex(),
            "-k", key.toHex(),
            inputFile,
        ]);

        expect(output?.metalId).toBe(metalId);
        expect(output?.type).toBe(MetadataType.Mosaic);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);

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
        const output = await VerifyCLI.main([
            "--src-addr", targetAccount.address.plain(),
            "--tgt-addr", signerAccount.address.plain(),
            "-n", namespaceId.fullName,
            "--key", key.toHex(),
            inputFile,
        ]);

        expect(output?.metalId).toBe(metalId);
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined()
        expect(output?.namespaceId?.toHex()).toBe(namespaceId.toHex());

        assert(metalId);
        await MetalTest.scrapMetal(metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);
});
