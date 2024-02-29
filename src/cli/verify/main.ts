import assert from "assert";
import { MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { MetalServiceV2 } from "../../services";
import { doVerify, metalService, symbolService } from "../common";
import { readStreamInput } from "../stream";
import { VerifyInput } from "./input";
import { VerifyOutput } from "./output";


export namespace VerifyCLI {

    export const main = async (argv: string[]) => {
        let input: VerifyInput.CommandlineInput;
        try {
            input = await VerifyInput.validateInput(VerifyInput.parseInput(argv));
        } catch (e) {
            VerifyInput.printVersion();
            if (e === "version") {
                return;
            }
            VerifyInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        // Read input file contents here.
        const payload = await readStreamInput(input);

        let sourceAddress = input.sourceAddress || input.signerAccount?.address;
        let targetAddress = input.targetAddress || input.signerAccount?.address;
        let type = input.type;
        let key = input.key;
        let targetId = [undefined, input.mosaicId, input.namespaceId][type];

        if (input.metalId) {
            // Obtain type, sourceAddress, targetAddress, key and targetId here.
            const metadataEntry = (await metalService.getFirstChunk(input.metalId)).metadataEntry;
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

        const { networkType } = await symbolService.getNetwork();
        const metalId = input.metalId ||
            MetalServiceV2.calculateMetalId(type, sourceAddress, targetAddress, targetId, key);
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

}

