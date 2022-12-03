import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {Account, MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {initTestEnv, MetalTest, SymbolTest} from "./utils";
import assert from "assert";
import fs from "fs";
import {VerifyCLI} from "../cli";


describe("Verify CLI", () => {
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
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signer1.publicAccount,
            target.publicAccount,
            undefined,
            testData,
            signer1,
            [ target ],
        );

        const output = await VerifyCLI.main([
            metalId,
            inputFile,
        ]);

        expect(output?.key).toStrictEqual(key);
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.sourceAddress).toStrictEqual(signer1.address);
        expect(output?.targetAddress).toStrictEqual(target.address);
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, signer1.publicAccount, target.publicAccount, signer1, [ target ]);
    }, 600000);

    it("Mosaic Metal via metal ID", async () => {
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

        const output = await VerifyCLI.main([
            metalId,
            inputFile,
        ]);

        expect(output?.key).toStrictEqual(key);
        expect(output?.type).toBe(MetadataType.Mosaic);
        expect(output?.sourceAddress).toStrictEqual(target.address);
        expect(output?.targetAddress).toStrictEqual(signer1.address);
        expect(output?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, target.publicAccount, signer1.publicAccount, signer1, [ target ]);
    }, 600000);

    it("Namespace Metal via metal ID", async () => {
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

        const output = await VerifyCLI.main([
            metalId,
            inputFile,
        ]);

        expect(output?.key).toStrictEqual(key);
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.sourceAddress).toStrictEqual(target.address);
        expect(output?.targetAddress).toStrictEqual(signer1.address);
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId?.toHex()).toBe(namespaceId.toHex());

        assert(metalId);
        await MetalTest.scrapMetal(metalId, target.publicAccount, signer1.publicAccount, signer1, [ target ]);
    }, 600000);

    it("Account Metal via metadata key", async () => {
        const { signer1 } = await SymbolTest.getNamedAccounts();
        const { metalId, key } = await MetalTest.forgeMetal(
            MetadataType.Account,
            signer1.publicAccount,
            target.publicAccount,
            undefined,
            testData,
            signer1,
            [ target ],
        );

        const output = await VerifyCLI.main([
            "--priv-key", signer1.privateKey,
            "-t", target.publicKey,
            "-k", key.toHex(),
            inputFile,
        ]);

        expect(output?.metalId).toStrictEqual(metalId);
        expect(output?.type).toBe(MetadataType.Account);
        expect(output?.sourceAddress).toStrictEqual(signer1.address);
        expect(output?.targetAddress).toStrictEqual(target.address);
        expect(output?.mosaicId).toBeUndefined();
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, signer1.publicAccount, target.publicAccount, signer1, [ target ]);
    }, 600000);

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

        const output = await VerifyCLI.main([
            "--priv-key", signer1.privateKey,
            "-s", target.publicKey,
            "-m", mosaicId.toHex(),
            "-k", key.toHex(),
            inputFile,
        ]);

        expect(output?.metalId).toStrictEqual(metalId);
        expect(output?.type).toBe(MetadataType.Mosaic);
        expect(output?.sourceAddress).toStrictEqual(target.address);
        expect(output?.targetAddress).toStrictEqual(signer1.address);
        expect(output?.mosaicId?.toHex()).toBe(mosaicId.toHex());
        expect(output?.namespaceId).toBeUndefined();

        assert(metalId);
        await MetalTest.scrapMetal(metalId, target.publicAccount, signer1.publicAccount, signer1, [ target ]);
    }, 600000);

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
        const output = await VerifyCLI.main([
            "--src-addr", target.address.plain(),
            "--tgt-addr", signer1.address.plain(),
            "-n", namespaceId.fullName,
            "--key", key.toHex(),
            inputFile,
        ]);

        expect(output?.metalId).toStrictEqual(metalId);
        expect(output?.type).toBe(MetadataType.Namespace);
        expect(output?.sourceAddress).toStrictEqual(target.address);
        expect(output?.targetAddress).toStrictEqual(signer1.address);
        expect(output?.mosaicId).toBeUndefined()
        expect(output?.namespaceId?.toHex()).toBe(namespaceId.toHex());

        assert(metalId);
        await MetalTest.scrapMetal(metalId, target.publicAccount, signer1.publicAccount, signer1, [ target ]);
    }, 600000);
});