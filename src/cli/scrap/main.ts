import {CommandlineInput, parseInput, printUsage, validateInput} from "./input";
import assert from "assert";
import fs from "fs";
import {MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {CommandlineOutput, printOutputSummary, writeOutputFile} from "./output";
import {MetalService} from "../../services/metal";
import {VERSION} from "./version";
import {SymbolService} from "../../services/symbol";
import {buildAndExecuteBatches} from "../common";


const scrapMetal = async (
    input: CommandlineInput,
): Promise<CommandlineOutput> => {
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
            key = MetalService.calculateMetadataKey(payload, input.additive);
        }

        assert(type !== undefined);
        assert(key);

        // Obtain targetId and metalId here
        targetId = [ undefined, input.mosaicId, input.namespaceId ][type];
        metalId = MetalService.calculateMetalId(
            type,
            sourceAccount.address,
            targetAccount.address,
            key,
            targetId,
        )
    }

    const txs = (payload)
        ? await MetalService.createDestroyTxs(
            type,
            sourceAccount,
            targetAccount,
            targetId,
            payload,
            input.additive,
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

    // Not estimate mode. Cosigns are unnecessary: Announce TXs
    const canAnnounce = !input.estimate && (
        signerAccount.equals(sourceAccount) || !!input.sourceSigner
    ) && (
        signerAccount.equals(targetAccount) || !!input.targetSigner
    );

    const { batches, totalFee } = txs.length
        ? await buildAndExecuteBatches(
            txs,
            input.signer,
            [
                ...(!signerAccount.equals(sourceAccount) && input.sourceSigner ? [ input.sourceSigner ] : []),
                ...(!signerAccount.equals(targetAccount) && input.targetSigner ? [ input.targetSigner ] : []),
            ],
            input.feeRatio,
            input.maxParallels,
            canAnnounce,
            !input.force,
        )
        : { batches: [], totalFee: UInt64.fromUint(0) };

    return {
        networkType,
        batches,
        key,
        totalFee,
        sourceAccount,
        targetAccount,
        ...(type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
        ...(type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
        status: canAnnounce ? "scrapped" : "estimated",
        metalId,
    };
};

const main = async () => {
    console.log(`Scrap Metal CLI version ${VERSION}`);

    let input: CommandlineInput;
    try {
        input = await validateInput(parseInput());
    } catch (e) {
        printUsage();
        if (e === "help") {
            return;
        }
        throw e;
    }

    const output = await scrapMetal(input);

    if (input.outputPath) {
        writeOutputFile(output, input.outputPath);
    }

    printOutputSummary(output);
};

main()
    .catch((e) => {
        console.error(e.toString());
        process.exit(1);
    });