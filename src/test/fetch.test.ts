import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import fs from "fs";
import {FetchCLI} from "../cli";


describe("Fetch CLI", () => {
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

        const output = await FetchCLI.main([
            "--no-save",
            metalId,
        ]);

        expect(output?.key?.toDTO()).toStrictEqual(key.toDTO());
        expect(output?.type).toBe(MetadataType.Mosaic);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(output?.namespaceId).toBeUndefined();
        expect(output?.payload.buffer).toStrictEqual(testData.buffer);

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

        const output = await FetchCLI.main([
            "--no-save",
            metalId,
        ]);

        expect(output?.key?.toDTO()).toStrictEqual(key.toDTO());
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId?.toHex()).toBe(namespaceId.toHex());
        expect(output?.payload.buffer).toStrictEqual(testData.buffer);

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

        const output = await FetchCLI.main([
            "--no-save",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-k", key.toHex(),
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

        const output = await FetchCLI.main([
            "--no-save",
            "--src-pub-key", targetAccount.publicKey,
            "--tgt-pub-key", signerAccount.publicKey,
            "-m", mosaicId.toHex(),
            "-k", key.toHex(),
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
        const output = await FetchCLI.main([
            "--no-save",
            "--src-addr", targetAccount.address.plain(),
            "--tgt-addr", signerAccount.address.plain(),
            "--namespace", namespaceId.toHex(),
            "--key", key.toHex(),
        ]);

        expect(output?.metalId).toBe(metalId);
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.sourceAddress.toDTO()).toStrictEqual(targetAccount.address.toDTO());
        expect(output?.targetAddress.toDTO()).toStrictEqual(signerAccount.address.toDTO());
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId?.toHex()).toBe(namespaceId.toHex());

        assert(metalId);
        await MetalTest.scrapMetal(metalId, targetAccount.publicAccount, signerAccount.publicAccount, signerAccount, [ targetAccount ]);
    }, 600000);
});