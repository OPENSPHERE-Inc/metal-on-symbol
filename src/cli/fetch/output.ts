import {Address, MosaicId, NamespaceId, NetworkType, UInt64} from "symbol-sdk";
import fs from "fs";

export interface CommandlineOutput {
    networkType: NetworkType,
    payload: Buffer;
    sourceAddress: Address,
    targetAddress: Address,
    key: UInt64 | undefined;
    mosaicId?: MosaicId,
    namespaceId?: NamespaceId,
    metalId: string;
}

export const printOutputSummary = (output: CommandlineOutput) => {
    console.log(
        `--- Fetch Summary ---\n` +
        `  Metal ID: ${output.metalId}\n` +
        `  Type: ${output.mosaicId ? "mosaic" : output.namespaceId ? "namespace" : "account" }\n` +
        `  Source Account Address: ${output.sourceAddress.plain()}\n` +
        `  Target Account Address: ${output.targetAddress.plain()}\n` +
        (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
        (output.namespaceId ? `  Namespace ID: ${output.namespaceId.fullName} (${output.namespaceId.toHex()})\n` : "") +
        `  Metadata Key: ${output.key?.toHex()}\n` +
        `  Data size: ${output.payload.length} Bytes\n` +
        `  Network Type: ${output.networkType}`
    );
};

export const writeOutputFile = (output: CommandlineOutput, filePath: string) => {
    fs.writeFileSync(filePath, output.payload);
};