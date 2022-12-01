import {VerifyInput} from "./input";
import assert from "assert";
import fs from "fs";
import {doVerify} from "../common";
import {VERSION} from "./version";
import {MetalService} from "../../services/metal";
import {VerifyOutput} from "./output";
import {MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {SymbolService} from "../../services/symbol";


export const main = async (argv: string[]) => {
    console.log(`Metal Verify CLI version ${VERSION}\n`);

    let input: VerifyInput.CommandlineInput;
    try {
        input = await VerifyInput.validateInput(VerifyInput.parseInput(argv));
    } catch (e) {
        VerifyInput.printUsage();
        if (e === "help") {
            return;
        }
        throw e;
    }

    // Read input file contents here.
    assert(input.filePath);
    console.log(`${input.filePath}: Reading...`);
    const payload = fs.readFileSync(input.filePath);
    if (!payload.length) {
        throw Error(`${input.filePath}: The file is empty.`);
    }

    let sourceAddress = input.sourceAddress || input.signer?.address;
    let targetAddress = input.targetAddress || input.signer?.address;
    let type = input.type;
    let key = input.key;
    let targetId = [undefined, input.mosaicId, input.namespaceId][type];

    if (input.metalId) {
        // Obtain type, sourceAddress, targetAddress, key and targetId here.
        const metadataEntry = (await MetalService.getFirstChunk(input.metalId)).metadataEntry;
        type = metadataEntry.metadataType
        sourceAddress = metadataEntry.sourceAddress;
        targetAddress = metadataEntry.targetAddress;
        key = metadataEntry.scopedMetadataKey;
        targetId = metadataEntry.targetId;
    }

    assert(type !== undefined);
    assert(key);
    assert(sourceAddress);
    assert(targetAddress);

    await doVerify(
        payload,
        type,
        sourceAddress,
        targetAddress,
        key,
        targetId,
    );

    const { networkType } = await SymbolService.getNetwork();
    const metalId = input.metalId || MetalService.calculateMetalId(type, sourceAddress, targetAddress, targetId, key);
    const output: VerifyOutput.CommandlineOutput = {
        type,
        networkType,
        payload,
        sourceAddress,
        targetAddress,
        ...(type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
        ...(type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
        key,
        metalId,
    };

    VerifyOutput.printOutputSummary(output);

    return output;
};
