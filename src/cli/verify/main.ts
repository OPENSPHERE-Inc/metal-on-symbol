import {CommandlineInput, parseInput, printUsage, validateInput} from "./input";
import assert from "assert";
import fs from "fs";
import {doVerify} from "../common";
import {VERSION} from "./version";
import {MetalService} from "../../services/metal";


const main = async () => {
    console.log(`Verify Metal CLI version ${VERSION}`);

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

    if (input.metalId) {
        const metadataEntry = (await MetalService.getFirstChunk(input.metalId)).metadataEntry;
        type = metadataEntry.metadataType
        sourceAddress = metadataEntry.sourceAddress;
        targetAddress = metadataEntry.targetAddress;
        key = metadataEntry.scopedMetadataKey;
    }

    assert(type !== undefined);
    assert(key);
    assert(sourceAddress);
    assert(targetAddress);

    if (input.metalId) {
        console.log(`Verifying ${input.metalId} with ${input.filePath}`);
    } else {
        console.log(
            `Verifying ${key} (source:${sourceAddress?.plain()}, target:${
                [targetAddress?.plain(), input.mosaicId, input.namespaceId][type]
            }) with ${input.filePath}`
        );
    }

    await doVerify(
        payload,
        type,
        sourceAddress,
        targetAddress,
        key,
        [undefined, input.mosaicId, input.namespaceId][type],
    );
};

main()
    .catch((e) => {
        console.error(e.toString());
        process.exit(1);
    });