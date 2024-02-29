import "./env";
import { AggregateUndeadTransaction, MetadataTransaction } from "@opensphere-inc/symbol-service";
import assert from "assert";
import fs from "fs";
import path from "path"
import {
    Account,
    Deadline,
    MetadataType,
    Mosaic,
    MosaicId,
    MosaicMetadataTransaction,
    NamespaceId,
    NamespaceMetadataTransaction,
    PlainMessage,
    TransferTransaction,
    UInt64,
} from "symbol-sdk";
import { ForgeCLI, ReinforceCLI, ScrapCLI } from "../cli";
import { writeIntermediateFile } from "../cli/intermediate";
import { MetalServiceV2 } from "../services";
import { initTestEnv, MetalTest, symbolService, SymbolTest } from "./utils";
import compareBatches = MetalTest.compareBatches;


describe("Reinforce CLI", () => {
    let inputFile: string;
    let outputFile: string;
    let targetAccount: Account;
    let mosaicId: MosaicId;
    let namespaceId: NamespaceId;
    let metalId: string;

    beforeAll(async () => {
        initTestEnv();

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;
        assert(process.env.TEST_OUTPUT_FILE);
        outputFile = process.env.TEST_OUTPUT_FILE;

        const assets = await SymbolTest.generateAssets();
        targetAccount = assets.account;
        mosaicId = assets.mosaicId;
        namespaceId = assets.namespaceId;

        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    }, 600000);

    afterEach(() => {
        if (fs.existsSync(outputFile)) {
            fs.unlinkSync(outputFile);
        }
    });

    it("Forge Account Metal", async() => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const forgeOutput = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-c",
            "--additive", String(MetalServiceV2.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        expect(forgeOutput?.metalId).toBeDefined();
        expect(fs.existsSync(outputFile)).toBeTruthy();

        assert(forgeOutput?.metalId);
        metalId = forgeOutput?.metalId;

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLI.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        compareBatches(estimateOutput?.batches, forgeOutput?.batches);
        expect(estimateOutput?.metalId).toBe(forgeOutput?.metalId);
        expect(estimateOutput?.command).toBe("forge");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.payload.buffer).toStrictEqual(forgeOutput?.payload.buffer);
        expect(estimateOutput?.totalFee.toDTO()).toStrictEqual(forgeOutput?.totalFee.toDTO());
        expect(estimateOutput?.type).toBe(forgeOutput?.type);
        expect(estimateOutput?.sourcePubAccount).toStrictEqual(forgeOutput?.sourcePubAccount);
        expect(estimateOutput?.targetPubAccount).toStrictEqual(forgeOutput?.targetPubAccount);
        expect(estimateOutput?.key?.toDTO()).toStrictEqual(forgeOutput?.key?.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(forgeOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(forgeOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(forgeOutput?.additive);
        expect(estimateOutput?.signerPubAccount).toStrictEqual(forgeOutput?.signerPubAccount);

        const reinforceOutput = await ReinforceCLI.main([
            "-a",
            "-f",
            "--cosigner", targetAccount.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(forgeOutput?.metalId);
        expect(reinforceOutput?.command).toBe("forge");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 600000);

    it("Scrap Account Metal", async() => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-o", outputFile,
            metalId,
        ]);

        expect(fs.existsSync(outputFile)).toBeTruthy();

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLI.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        compareBatches(estimateOutput?.batches, scrapOutput?.batches);
        expect(estimateOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(estimateOutput?.command).toBe("scrap");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.totalFee.toDTO()).toStrictEqual(scrapOutput?.totalFee.toDTO());
        expect(estimateOutput?.type).toBe(scrapOutput?.type);
        expect(estimateOutput?.sourcePubAccount).toStrictEqual(scrapOutput?.sourcePubAccount);
        expect(estimateOutput?.targetPubAccount).toStrictEqual(scrapOutput?.targetPubAccount);
        expect(estimateOutput?.key?.toDTO()).toStrictEqual(scrapOutput?.key?.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(scrapOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(scrapOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(scrapOutput?.additive);
        expect(estimateOutput?.signerPubAccount).toStrictEqual(scrapOutput?.signerPubAccount);

        const reinforceOutput = await ReinforceCLI.main([
            "-a",
            "-f",
            "--priv-key", targetAccount.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(reinforceOutput?.command).toBe("scrap");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 600000);

    it("Reject manipulated intermediate TXs", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const forgeOutput1 = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-c",
            "--additive", String(MetalServiceV2.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        const forgeOutput2 = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-c",
            "--additive", String(MetalServiceV2.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        // Mix each outputs
        assert(forgeOutput1?.batches);
        assert(forgeOutput2?.batches);
        writeIntermediateFile({
            ...forgeOutput1,
            batches: [ ...forgeOutput1.batches, ...forgeOutput2.batches ],
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Input file is wrong or broken.");

        // Manipulated sourceAccount
        writeIntermediateFile({
            ...forgeOutput1,
            sourcePubAccount: targetAccount.publicAccount,
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Transaction's hash was mismatched.");

        // Manipulated targetAccount
        writeIntermediateFile({
            ...forgeOutput1,
            targetPubAccount: signerAccount.publicAccount,
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Transaction's hash was mismatched.");

        // Manipulated mosaicId
        const forgeOutput3 = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            "-m", mosaicId.toHex(),
            "-c",
            "--additive", String(MetalServiceV2.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        assert(forgeOutput3);
        writeIntermediateFile({
            ...forgeOutput3,
            mosaicId: new MosaicId("123456789ABCDEF0"),
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Transaction's hash was mismatched.");

        // Manipulated namespaceId
        const forgeOutput4 = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-s", targetAccount.publicKey,
            "-n", namespaceId.toHex(),
            "-c",
            "--additive", String(MetalServiceV2.generateRandomAdditive()),
            "-o", outputFile,
            inputFile,
        ]);

        assert(forgeOutput4);
        writeIntermediateFile({
            ...forgeOutput4,
            namespaceId: new NamespaceId("manipulated-namespace"),
        }, outputFile);

        await expect(async () => {
            await ReinforceCLI.main([
                "-f",
                outputFile,
                inputFile,
            ]);
        }).rejects.toThrowError("Transaction's hash was mismatched.");

        // Contamination
        const { epochAdjustment, networkCurrencyMosaicId, networkType } = await symbolService.getNetwork();
        const txs = [
            TransferTransaction.create(
                Deadline.create(epochAdjustment),
                signerAccount.address,
                [ new Mosaic(networkCurrencyMosaicId, UInt64.fromNumericString("10000000000") ) ],
                PlainMessage.create("I stole your money"),
                networkType,
            ).toAggregate(targetAccount.publicAccount)
        ];
        const batches = await symbolService.buildSignedAggregateCompleteTxBatches(txs, signerAccount);

        await expect(async () => {
            assert(forgeOutput1?.batches);
            writeIntermediateFile({
                ...forgeOutput1,
                batches: [ ...forgeOutput1.batches, ...batches ],
            }, outputFile);
        }).rejects.toThrowError("The transaction type must be account/mosaic/namespace metadata.");

    }, 600000);

    const compareUndeadBatches = (batches1?: AggregateUndeadTransaction[], batches2?: AggregateUndeadTransaction[]) => {
        batches1?.forEach((batch1, index) => {
            const batch2 = batches2?.[index];
            expect(batch1.nonce.toDTO()).toStrictEqual(batch2?.nonce.toDTO());
            expect(batch1.signatures).toStrictEqual(batch2?.signatures);
            expect(batch1.publicKey).toBe(batch2?.publicKey);
            expect(batch1.aggregateTx.type).toBe(batch2?.aggregateTx.type);
            expect(batch1.aggregateTx.maxFee.toDTO()).toStrictEqual(batch2?.aggregateTx.maxFee.toDTO());

            batch1.aggregateTx.innerTransactions.forEach((innerTx1, innerIndex) => {
                const metadataTx1 = innerTx1 as MetadataTransaction;
                const metadataTx2 = batch2?.aggregateTx.innerTransactions[innerIndex] as MetadataTransaction;
                expect(metadataTx1.type).toBe(metadataTx2?.type);
                expect(metadataTx1.signer?.toDTO()).toStrictEqual(metadataTx2?.signer?.toDTO());
                expect(metadataTx1.targetAddress.toDTO()).toStrictEqual(metadataTx2?.targetAddress.toDTO());
                expect(metadataTx1.value).toStrictEqual(metadataTx2?.value);
                if (metadataTx1.type === MetadataType.Mosaic) {
                    expect((metadataTx1 as MosaicMetadataTransaction).targetMosaicId.toHex())
                        .toBe((metadataTx2 as MosaicMetadataTransaction).targetMosaicId.toHex());
                } else if (metadataTx1.type === MetadataType.Namespace) {
                    expect((metadataTx1 as NamespaceMetadataTransaction).targetNamespaceId.toHex())
                        .toBe((metadataTx2 as NamespaceMetadataTransaction).targetNamespaceId.toHex());
                }
            });
        });
    };

    it("Forge Account Metal with long life intermediate TX", async() => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const forgeOutput = await ForgeCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "-c",
            "--deadline", `${24 * 5}`,
            "--additive", String(MetalServiceV2.generateRandomAdditive()),
            "--num-cosigs", "1",
            "-o", outputFile,
            inputFile,
        ]);

        expect(forgeOutput?.metalId).toBeDefined();
        expect(fs.existsSync(outputFile)).toBeTruthy();

        assert(forgeOutput?.metalId);
        metalId = forgeOutput?.metalId;

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLI.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        compareUndeadBatches(estimateOutput?.undeadBatches, forgeOutput?.undeadBatches);
        expect(estimateOutput?.metalId).toBe(forgeOutput?.metalId);
        expect(estimateOutput?.command).toBe("forge");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.payload.buffer).toStrictEqual(forgeOutput?.payload.buffer);
        expect(estimateOutput?.totalFee.toDTO()).toStrictEqual(forgeOutput?.totalFee.toDTO());
        expect(estimateOutput?.type).toBe(forgeOutput?.type);
        expect(estimateOutput?.sourcePubAccount).toStrictEqual(forgeOutput?.sourcePubAccount);
        expect(estimateOutput?.targetPubAccount).toStrictEqual(forgeOutput?.targetPubAccount);
        expect(estimateOutput?.key?.toDTO()).toStrictEqual(forgeOutput?.key?.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(forgeOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(forgeOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(forgeOutput?.additive);
        expect(estimateOutput?.signerPubAccount).toStrictEqual(forgeOutput?.signerPubAccount);

        const reinforceOutput = await ReinforceCLI.main([
            "-a",
            "-f",
            "--cosigner", targetAccount.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(forgeOutput?.metalId);
        expect(reinforceOutput?.command).toBe("forge");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 600000);

    it("Scrap Account Metal with long life intermediate TX", async() => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const scrapOutput = await ScrapCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "-t", targetAccount.publicKey,
            "--deadline", `${24 * 5}`,
            "--num-cosigs", "1",
            "-o", outputFile,
            metalId,
        ]);

        expect(fs.existsSync(outputFile)).toBeTruthy();

        // Overwrite outputFile
        const estimateOutput = await ReinforceCLI.main([
            "-f",
            "--out", outputFile,
            outputFile,
            inputFile,
        ]);

        compareUndeadBatches(estimateOutput?.undeadBatches, scrapOutput?.undeadBatches);
        expect(estimateOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(estimateOutput?.command).toBe("scrap");
        expect(estimateOutput?.status).toBe("estimated");
        expect(estimateOutput?.totalFee.toDTO()).toStrictEqual(scrapOutput?.totalFee.toDTO());
        expect(estimateOutput?.type).toBe(scrapOutput?.type);
        expect(estimateOutput?.sourcePubAccount).toStrictEqual(scrapOutput?.sourcePubAccount);
        expect(estimateOutput?.targetPubAccount).toStrictEqual(scrapOutput?.targetPubAccount);
        expect(estimateOutput?.key?.toDTO()).toStrictEqual(scrapOutput?.key?.toDTO());
        expect(estimateOutput?.mosaicId?.toHex()).toBe(scrapOutput?.mosaicId);
        expect(estimateOutput?.namespaceId?.toHex()).toBe(scrapOutput?.namespaceId?.toHex());
        expect(estimateOutput?.additive).toBe(scrapOutput?.additive);
        expect(estimateOutput?.signerPubAccount).toStrictEqual(scrapOutput?.signerPubAccount);

        const reinforceOutput = await ReinforceCLI.main([
            "-a",
            "-f",
            "--priv-key", targetAccount.privateKey,
            outputFile,
            inputFile,
        ]);

        expect(reinforceOutput?.metalId).toBe(scrapOutput?.metalId);
        expect(reinforceOutput?.command).toBe("scrap");
        expect(reinforceOutput?.status).toBe("reinforced");
    }, 600000);

});
