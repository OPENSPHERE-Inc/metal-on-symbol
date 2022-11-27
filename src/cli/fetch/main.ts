import {CommandlineInput, parseInput, printUsage, validateInput} from "./input";
import assert from "assert";
import {VERSION} from "./version";
import {MetalService} from "../../services/metal";
import {MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {CommandlineOutput, printOutputSummary, writeOutputFile} from "./output";
import {SymbolService} from "../../services/symbol";


const main = async () => {
    console.log(`Fetch Metal CLI version ${VERSION}`);

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

    let sourceAddress = input.sourceAddress || input.signer?.address;
    let targetAddress = input.targetAddress || input.signer?.address;
    let type = input.type;
    let key = input.key;
    let targetId: undefined | MosaicId | NamespaceId;

    if (input.metalId) {
        const metadataEntry = (await MetalService.getFirstChunk(input.metalId)).metadataEntry;
        type = metadataEntry.metadataType
        sourceAddress = metadataEntry.sourceAddress;
        targetAddress = metadataEntry.targetAddress;
        key = metadataEntry.scopedMetadataKey;
        targetId = metadataEntry.targetId;
    } else {
        assert(type !== undefined);
        targetId = [ undefined, input.mosaicId, input.namespaceId ][type];
    }

    assert(key);
    assert(sourceAddress);
    assert(targetAddress);

    const payload = await MetalService.fetch(type, sourceAddress, targetAddress, targetId, key);

    const { networkType } = await SymbolService.getNetwork();
    const metalId = input.metalId || MetalService.calculateMetalId(type, sourceAddress, targetAddress, key, targetId);
    const output: CommandlineOutput = {
        networkType,
        payload,
        sourceAddress,
        targetAddress,
        ...(type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
        ...(type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
        key,
        metalId,
    };
    writeOutputFile(output, input.outputPath || metalId);

    printOutputSummary(output);
};

main()
    .catch((e) => {
        console.error(e.toString());
        process.exit(1);
    });