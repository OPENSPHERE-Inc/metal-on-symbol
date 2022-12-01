import {ScrapInput} from "./input";
import assert from "assert";
import fs from "fs";
import {MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {ScrapOutput} from "./output";
import {MetalService} from "../../services/metal";
import {VERSION} from "./version";
import {SymbolService} from "../../services/symbol";
import {buildAndExecuteBatches, designateCosigners} from "../common";
import {writeIntermediateFile} from "../intermediate";


const scrapMetal = async (
    input: ScrapInput.CommandlineInput,
): Promise<ScrapOutput.CommandlineOutput> => {
    const { networkType } = await SymbolService.getNetwork();
    assert(input.signer);

    const signerAccount = input.signer.publicAccount;
    let sourceAccount = input.sourceAccount || input.sourceSigner?.publicAccount || signerAccount;
    let targetAccount = input.targetAccount || input.targetSigner?.publicAccount || signerAccount;
    let type = input.type;
    let key = input.key;
    let metalId = input.metalId;
    let targetId: undefined | MosaicId | NamespaceId = undefined;
    let payload: undefined | Buffer;

    if (input.filePath) {
        // Read input file contents here.
        console.log(`${input.filePath}: Reading...`);
        payload = fs.readFileSync(input.filePath);
        if (!payload.length) {
            throw Error(`${input.filePath}: The file is empty.`);
        }
    }

    if (metalId) {
        const metadataEntry = (await MetalService.getFirstChunk(metalId)).metadataEntry;
        // Obtain type, key and targetId here.
        type = metadataEntry.metadataType
        key = metadataEntry.scopedMetadataKey;
        targetId = metadataEntry.targetId;

        // We cannot retrieve publicKey at this time. Only can do address check.
        if (!sourceAccount.address.equals(metadataEntry?.sourceAddress)) {
            throw new Error(`Source address mismatched.`);
        }
        if (!targetAccount.address.equals(metadataEntry?.targetAddress)) {
            throw new Error(`Target address mismatched.`);
        }
    } else {
        if (!key && payload) {
            // Obtain metadata key here
            key = MetalService.calculateMetadataKey(payload, input.additiveBytes);
        }

        assert(type !== undefined);
        assert(key);

        // Obtain targetId and metalId here
        targetId = [ undefined, input.mosaicId, input.namespaceId ][type];
        metalId = MetalService.calculateMetalId(
            type,
            sourceAccount.address,
            targetAccount.address,
            targetId,
            key,
        );
    }

    const txs = (payload)
        ? await MetalService.createDestroyTxs(
            type,
            sourceAccount,
            targetAccount,
            targetId,
            payload,
            input.additiveBytes,
        )
        : await MetalService.createScrapTxs(
            type,
            sourceAccount,
            targetAccount,
            targetId,
            key,
        );
    if (!txs) {
        throw Error(`Scrap metal TXs creation failed.`);
    }

    const { designatedCosigners, hasEnoughCosigners } = designateCosigners(
        signerAccount,
        sourceAccount,
        targetAccount,
        input.sourceSigner,
        input.targetSigner,
        input.cosigners,
    );
    const canAnnounce = hasEnoughCosigners && !input.estimate && !input.outputPath;

    const { batches, totalFee } = txs.length
        ? await buildAndExecuteBatches(
            txs,
            input.signer,
            designatedCosigners,
            input.feeRatio,
            input.maxParallels,
            canAnnounce,
            !input.force,
        )
        : { batches: [], totalFee: UInt64.fromUint(0) };

    return {
        command: "scrap",
        networkType,
        batches,
        key,
        totalFee,
        sourceAccount: sourceAccount,
        targetAccount: targetAccount,
        ...(type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
        ...(type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
        status: canAnnounce ? "scrapped" : "estimated",
        metalId,
        signerAccount,
        additive: input.additive,
        type,
        createdAt: new Date(),
    };
};

export const main = async (argv: string[]) => {
    console.log(`Metal Scrap CLI version ${VERSION}\n`);

    let input: ScrapInput.CommandlineInput;
    try {
        input = await ScrapInput.validateInput(ScrapInput.parseInput(argv));
    } catch (e) {
        ScrapInput.printUsage();
        if (e === "help") {
            return;
        }
        throw e;
    }

    const output = await scrapMetal(input);
    if (input.outputPath) {
        writeIntermediateFile(output, input.outputPath);
    }
    ScrapOutput.printOutputSummary(output);

    return output;
};
