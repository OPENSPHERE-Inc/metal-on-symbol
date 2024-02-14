import assert from "assert";
import { MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { Logger } from "../../libs";
import { MetalServiceV2 } from "../../services";
import { metalService, symbolService } from "../common";
import { writeStreamOutput } from "../stream";
import { FetchInput } from "./input";
import { FetchOutput } from "./output";


export namespace FetchCLI {

    export const main = async (argv: string[]) => {
        let input: FetchInput.CommandlineInput;
        try {
            input = await FetchInput.validateInput(FetchInput.parseInput(argv));
        } catch (e) {
            FetchInput.printVersion();
            if (e === "version") {
                return;
            }
            FetchInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        let sourceAddress = input.sourceAddress || input.signerAccount?.address;
        let targetAddress = input.targetAddress || input.signerAccount?.address;
        let type = input.type;
        let key = input.key;
        let targetId: undefined | MosaicId | NamespaceId;
        let payload: Uint8Array;

        if (input.metalId) {
            Logger.debug(`Fetching metal ${input.metalId}`);
            const result = await metalService.fetchByMetalId(input.metalId);
            if (!result) {
                throw new Error(`The metal fetch failed.`);
            }
            type = result.type
            sourceAddress = result.sourceAddress;
            targetAddress = result.targetAddress;
            key = result.key;
            targetId = result.targetId;
            payload = result.payload;
        } else {
            assert(type !== undefined);
            targetId = [ undefined, input.mosaicId, input.namespaceId ][type];

            assert(key);
            assert(sourceAddress);
            assert(targetAddress);

            Logger.debug(`Fetching metal key:${key.toHex()},source:${sourceAddress.plain()},${
                type === MetadataType.Mosaic
                    ? `mosaic:${targetId?.toHex()}`
                    : type === MetadataType.Namespace
                        ? `namespace:${targetId?.toHex()}`
                        : `account:${targetAddress.plain()}`
            }`);
            payload = (await metalService.fetch(type, sourceAddress, targetAddress, targetId, key)).payload;
        }

        if (!input.noSave) {
            writeStreamOutput(payload, input.outputPath);
        }

        const { networkType } = await symbolService.getNetwork();
        const metalId = input.metalId || MetalServiceV2.calculateMetalId(type, sourceAddress, targetAddress, targetId, key);
        const output: FetchOutput.CommandlineOutput = {
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

        FetchOutput.printOutputSummary(output);

        return output;
    };

}

