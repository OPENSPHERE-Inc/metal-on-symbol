import {Address, MetadataType, MosaicId, NamespaceId, NetworkType, UInt64} from "symbol-sdk";


export namespace VerifyOutput {

    export interface CommandlineOutput {
        networkType: NetworkType;
        payload: Buffer;
        sourceAddress: Address;
        targetAddress: Address;
        key: UInt64 | undefined;
        mosaicId?: MosaicId;
        namespaceId?: NamespaceId;
        metalId: string;
        type: MetadataType;
    }

    export const printOutputSummary = (output: CommandlineOutput) => {
        console.log(
            `\n  --- Verify Summary ---\n` +
            `  Metal ID: ${output.metalId}\n` +
            `  Type: ${output.mosaicId ? "Mosaic" : output.namespaceId ? "Namespace" : "Account" }\n` +
            `  Source Account Address: ${output.sourceAddress.plain()}\n` +
            `  Target Account Address: ${output.targetAddress.plain()}\n` +
            (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
            (output.namespaceId ? `  Namespace ID: ${output.namespaceId.toHex()}\n` : "") +
            `  Metadata Key: ${output.key?.toHex()}\n` +
            `  Data size: ${output.payload.length} bytes\n` +
            `  Network Type: ${output.networkType}\n`
        );
    };

}
