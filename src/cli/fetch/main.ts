import {FetchInput} from "./input";
import assert from "assert";
import {VERSION} from "./version";
import {MetalService} from "../../services";
import {MetadataType, MosaicId, NamespaceId} from "symbol-sdk";
import {FetchOutput} from "./output";
import {SymbolService} from "../../services";
import {PACKAGE_VERSION} from "../../package_version";
import {Logger} from "../../libs";
import {writeStreamOutput} from "../stream";


export namespace FetchCLI {

    export const main = async (argv: string[]) => {
        Logger.log(`Metal Fetch CLI version ${VERSION} (${PACKAGE_VERSION})\n`);

        let input: FetchInput.CommandlineInput;
        try {
            input = await FetchInput.validateInput(FetchInput.parseInput(argv));
        } catch (e) {
            FetchInput.printUsage();
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
        let payload: Uint8Array;

        if (input.metalId) {
            Logger.log(`Fetching metal ${input.metalId}`);
            const result = await MetalService.fetchByMetalId(input.metalId);
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

            Logger.log(`Fetching metal key:${key.toHex()},source:${sourceAddress.plain()},${
                type === MetadataType.Mosaic
                    ? `mosaic:${targetId?.toHex()}`
                    : type === MetadataType.Namespace
                        ? `namespace:${targetId?.toHex()}`
                        : `account:${targetAddress.plain()}`
            }`);
            payload = await MetalService.fetch(type, sourceAddress, targetAddress, targetId, key);
        }

        if (!input.noSave) {
            writeStreamOutput(payload, input.outputPath);
        }

        const { networkType } = await SymbolService.getNetwork();
        const metalId = input.metalId || MetalService.calculateMetalId(type, sourceAddress, targetAddress, targetId, key);
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

