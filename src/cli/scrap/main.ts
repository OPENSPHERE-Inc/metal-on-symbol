import {CommandlineInput, parseInput, printUsage, validateInput} from "./input";
import assert from "assert";
import fs from "fs";
import {MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
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

    if (metalId) {
        const metadataEntry = (await MetalService.getFirstChunk(metalId)).metadataEntry;
        type = metadataEntry.metadataType
        key = metadataEntry.scopedMetadataKey;
        targetId = metadataEntry.targetId;

        if (!sourceAccount.address.equals(metadataEntry?.sourceAddress)) {
            throw new Error(`Source address mismatched.`);
        }
        if (!targetAccount.address.equals(metadataEntry?.targetAddress)) {
            throw new Error(`Target address mismatched.`);
        }
    } else {
        if (input.filePath) {
            // Read input file contents here.
            console.log(`${input.filePath}: Reading...`);
            const payload = fs.readFileSync(input.filePath);
            if (!payload.length) {
                throw Error(`${input.filePath}: The file is empty.`);
            }

            // Just calculate key
            key = MetalService.calculateMetadataKey(payload, input.additive);
        }

        assert(type !== undefined);
        assert(key);

        targetId = [ undefined, input.mosaicId, input.namespaceId ][type];
        metalId = MetalService.calculateMetalId(
            type,
            sourceAccount.address,
            targetAccount.address,
            key,
            targetId,
        )
    }

    const txs = await MetalService.createScrapTxs(
        type,
        sourceAccount,
        targetAccount,
        key,
        targetId,
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

    const { batches, totalFee } = await buildAndExecuteBatches(
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
    );

    return {
        networkType,
        batches,
        key,
        totalFee,
        sourceAccount,
        targetAccount,
        ...(input.type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
        ...(input.type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
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