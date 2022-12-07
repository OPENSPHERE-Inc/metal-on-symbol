import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {initTestEnv, SymbolTest} from "./utils";
import {SymbolService} from "../services";
import {Account, Convert, KeyGenerator, Metadata, MetadataType, MosaicId, NamespaceId, UInt64,} from "symbol-sdk";
import {v4 as uuidv4} from "uuid";


describe("SymbolService", () => {
    let target: Account;
    const metadataKey = "test1key";
    const metadataValue = "test1value";
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let metadata: Metadata | undefined;

    beforeAll(async () => {
        initTestEnv();

        const { networkType } = await SymbolService.getNetwork();
        target = Account.generateNewAccount(networkType);
        console.log(`target.address=${target.address.plain()}`);
    });

    it("Create account metadata", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();

        const tx = await SymbolService.createMetadataTx(
            MetadataType.Account,
            source.publicAccount,
            target.publicAccount,
            undefined,
            metadataKey,
            metadataValue,
        );
        const result = await SymbolTest.doAggregateTx([tx], source, [ target ]);

        expect(result?.error).toBeUndefined();

        metadata = (await SymbolService.searchMetadata(
            MetadataType.Account,
            { source, target, key: metadataKey }
        )).shift();
        console.log(metadata);

        expect(metadata).toBeDefined();
        expect(metadata?.metadataEntry.sourceAddress).toStrictEqual(source.address);
        expect(metadata?.metadataEntry.targetAddress).toStrictEqual(target.address);
        expect(metadata?.metadataEntry.scopedMetadataKey).toStrictEqual(KeyGenerator.generateUInt64Key(metadataKey));
        expect(metadata?.metadataEntry.value).toBe(metadataValue);
    }, 600000);

    it("Composite account metadata hash", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();

        const compositeHash = SymbolService.calculateMetadataHash(
            MetadataType.Account,
            source.address,
            target.address,
            undefined,
            SymbolService.generateKey(metadataKey),
        );
        console.log(`compositeHash=${compositeHash}`);

        expect(compositeHash).toBe(metadata?.metadataEntry.compositeHash);

        const onChainMetadata = await SymbolService.getMetadataByHash(compositeHash);

        expect(onChainMetadata).toBeDefined();
        expect(onChainMetadata).toStrictEqual(metadata);
    });

    it("Empty account metadata", async () => {
        const { signer1: source } = await SymbolTest.getNamedAccounts();

        const metadataValueBytes = Convert.utf8ToUint8(metadataValue);
        const newValue = "";
        const newValueBytes = Convert.utf8ToUint8(newValue);
        const tx = await SymbolService.createMetadataTx(
            MetadataType.Account,
            source.publicAccount,
            target.publicAccount,
            undefined,
            metadataKey,
            Convert.hexToUint8(Convert.xor(metadataValueBytes, newValueBytes)),
            newValueBytes.length - metadataValueBytes.length,
        );
        const result = await SymbolTest.doAggregateTx([tx], source, [ target ]);

        expect(result?.error).toBeUndefined();

        metadata = (await SymbolService.searchMetadata(
            MetadataType.Account,
            { source, target, key: metadataKey }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Define mosaic", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const mosaicDefinition = await SymbolService.createMosaicDefinitionTx(
            creator.publicAccount,
            UInt64.fromUint(20),
            0,
            1,
        );
        const result = await SymbolTest.doAggregateTx(mosaicDefinition.txs, creator, []);
        mosaicId = mosaicDefinition.mosaicId;
        console.log(`mosaicId=${mosaicId.toHex()}`);

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Create mosaic metadata", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();
        const mosaicMetadataTx = await SymbolService.createMetadataTx(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            mosaicId,
            metadataKey,
            metadataValue,
        );
        const result = await SymbolTest.doAggregateTx([mosaicMetadataTx], creator, [ target ]);

        expect(result?.error).toBeUndefined();

        metadata = (await SymbolService.searchMetadata(
            MetadataType.Mosaic,
            { source: target, target: creator, key: metadataKey, targetId: mosaicId }
        )).shift();

        console.log(metadata);

        expect(metadata).toBeDefined();
        expect(metadata?.metadataEntry.sourceAddress).toStrictEqual(target.address);
        expect(metadata?.metadataEntry.targetAddress).toStrictEqual(creator.address);
        expect(metadata?.metadataEntry.targetId?.toHex()).toBe(mosaicId.toHex());
        expect(metadata?.metadataEntry.scopedMetadataKey).toStrictEqual(KeyGenerator.generateUInt64Key(metadataKey));
        expect(metadata?.metadataEntry.value).toBe(metadataValue);
    }, 600000);

    it("Composite mosaic metadata hash", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();

        const compositeHash = SymbolService.calculateMetadataHash(
            MetadataType.Mosaic,
            target.address,
            creator.address,
            mosaicId,
            SymbolService.generateKey(metadataKey),
        );
        console.log(`compositeHash=${compositeHash}`);

        expect(compositeHash).toBe(metadata?.metadataEntry.compositeHash);

        const onChainMetadata = await SymbolService.getMetadataByHash(compositeHash);

        expect(onChainMetadata).toBeDefined();
        expect(onChainMetadata).toStrictEqual(metadata);
    });

    it("Empty mosaic metadata", async () => {
        const { signer1: creator } = await SymbolTest.getNamedAccounts();

        const metadataValueBytes = Convert.utf8ToUint8(metadataValue);
        const newValue = "";
        const newValueBytes = Convert.utf8ToUint8(newValue);
        const tx = await SymbolService.createMetadataTx(
            MetadataType.Mosaic,
            target.publicAccount,
            creator.publicAccount,
            mosaicId,
            metadataKey,
            Convert.hexToUint8(Convert.xor(metadataValueBytes, newValueBytes)),
            newValueBytes.length - metadataValueBytes.length,
        );
        const result = await SymbolTest.doAggregateTx([tx], creator, [ target ]);

        expect(result?.error).toBeUndefined();

        metadata = (await SymbolService.searchMetadata(
            MetadataType.Mosaic,
            { source: target, target: creator, key: metadataKey, targetId: mosaicId }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Register namespace", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();
        const namespaceName = uuidv4();
        const namespaceTx = await SymbolService.createNamespaceRegistrationTx(
            owner.publicAccount,
            namespaceName,
            UInt64.fromUint(86400),
        );
        const result = await SymbolTest.doAggregateTx([ namespaceTx ], owner, []);
        namespaceId = new NamespaceId(namespaceName);
        console.log(`namespaceId=${namespaceId.toHex()}`);

        expect(result?.error).toBeUndefined();
    }, 600000);

    it("Create namespace metadata", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();
        const namespaceMetadataTx = await SymbolService.createMetadataTx(
            MetadataType.Namespace,
            target.publicAccount,
            owner.publicAccount,
            namespaceId,
            metadataKey,
            metadataValue,
        );
        const result = await SymbolTest.doAggregateTx([namespaceMetadataTx], owner, [ target ]);

        expect(result?.error).toBeUndefined();

        metadata = (await SymbolService.searchMetadata(
            MetadataType.Namespace,
            { source: target, target: owner, key: metadataKey, targetId: namespaceId }
        )).shift();

        console.log(metadata);

        expect(metadata).toBeDefined();
        expect(metadata?.metadataEntry.sourceAddress).toStrictEqual(target.address);
        expect(metadata?.metadataEntry.targetAddress).toStrictEqual(owner.address);
        expect(metadata?.metadataEntry.targetId?.toHex()).toBe(namespaceId.toHex());
        expect(metadata?.metadataEntry.scopedMetadataKey).toStrictEqual(KeyGenerator.generateUInt64Key(metadataKey));
        expect(metadata?.metadataEntry.value).toBe(metadataValue);
    }, 600000);

    it("Composite namespace metadata hash", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();

        const compositeHash = SymbolService.calculateMetadataHash(
            MetadataType.Namespace,
            target.address,
            owner.address,
            namespaceId,
            SymbolService.generateKey(metadataKey),
        );
        console.log(`compositeHash=${compositeHash}`);

        expect(compositeHash).toBe(metadata?.metadataEntry.compositeHash);

        const onChainMetadata = await SymbolService.getMetadataByHash(compositeHash);

        expect(onChainMetadata).toBeDefined();
        expect(onChainMetadata).toStrictEqual(metadata);
    });

    it("Empty namespace metadata", async () => {
        const { signer1: owner } = await SymbolTest.getNamedAccounts();

        const metadataValueBytes = Convert.utf8ToUint8(metadataValue);
        const newValue = "";
        const newValueBytes = Convert.utf8ToUint8(newValue);
        const tx = await SymbolService.createMetadataTx(
            MetadataType.Namespace,
            target.publicAccount,
            owner.publicAccount,
            namespaceId,
            metadataKey,
            Convert.hexToUint8(Convert.xor(metadataValueBytes, newValueBytes)),
            newValueBytes.length - metadataValueBytes.length,
        );
        const result = await SymbolTest.doAggregateTx([tx], owner, [ target ]);

        expect(result?.error).toBeUndefined();

        metadata = (await SymbolService.searchMetadata(
            MetadataType.Namespace,
            { source: target, target: owner, key: metadataKey, targetId: namespaceId }
        )).shift();

        expect(metadata).toBeUndefined();
    }, 600000);

    it("Encrypt and decrypt", async () => {
        const { signer1: sender } = await SymbolTest.getNamedAccounts();

        const plain = Convert.utf8ToUint8("Test text test text 123");
        const encrypted = SymbolService.encryptBinary(plain, sender, target.publicAccount);

        expect(encrypted.buffer).not.toStrictEqual(plain.buffer);

        const decrypted = SymbolService.decryptBinary(encrypted, sender.publicAccount, target);

        expect(decrypted.buffer).not.toStrictEqual(encrypted.buffer);
        expect(decrypted.buffer).toStrictEqual(plain.buffer);
    }, 600000);
});