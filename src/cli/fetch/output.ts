import {Address, MetadataType, MosaicId, NamespaceId, NetworkType, UInt64} from "symbol-sdk";
import {Logger} from "../../libs";


export namespace FetchOutput {

    export interface CommandlineOutput {
        networkType: NetworkType;
        payload: Uint8Array;
        sourceAddress: Address;
        targetAddress: Address;
        key: UInt64 | undefined;
        mosaicId?: MosaicId;
        namespaceId?: NamespaceId;
        metalId: string;
        type: MetadataType;
        text?: string;
    }

    export const printOutputSummary = (output: CommandlineOutput) => {
        Logger.info(
            `\n  --- Fetch Summary ---\n` +
            `  Metal ID: ${output.metalId}\n` +
            `  Type: ${output.mosaicId ? "Mosaic" : output.namespaceId ? "Namespace" : "Account" }\n` +
            `  Source Account Address: ${output.sourceAddress.plain()}\n` +
            `  Target Account Address: ${output.targetAddress.plain()}\n` +
            (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
            (output.namespaceId ? `  Namespace ID: ${output.namespaceId.toHex()}\n` : "") +
            `  Metadata Key: ${output.key?.toHex()}\n` +
            (output.text ? `  Text: ${output.text}\n` : "") +
            `  Data size: ${output.payload.length} bytes\n` +
            `  Network Type: ${output.networkType}\n`
        );
    };

}

