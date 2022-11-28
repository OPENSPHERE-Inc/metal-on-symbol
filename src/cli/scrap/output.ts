import {Convert, MosaicId, NamespaceId, NetworkType, PublicAccount, UInt64} from "symbol-sdk";
import {SymbolService} from "../../services/symbol";
import {toXYM} from "../../libs/utils";
import Long from "long";
import fs from "fs";
import {VERSION} from "./version";


export interface CommandlineOutput {
    networkType: NetworkType,
    batches: SymbolService.SignedAggregateTx[];
    sourceAccount: PublicAccount,
    targetAccount: PublicAccount,
    key: UInt64 | undefined;
    mosaicId?: MosaicId,
    namespaceId?: NamespaceId,
    totalFee: UInt64;
    status: "scrapped" | "estimated" | "destroyed";
    metalId: string;
}

export const printOutputSummary = (output: CommandlineOutput) => {
    console.log(
        `--- ${output.status === "scrapped" 
            ? "Scrap" 
            : "Estimate of Scrapping"
        } Summary ---\n` +
        `  Metal ID: ${output.metalId}\n` +
        `  Type: ${output.mosaicId ? "mosaic" : output.namespaceId ? "namespace" : "account" }\n` +
        `  Source Account Address: ${output.sourceAccount.address.plain()}\n` +
        `  Target Account Address: ${output.targetAccount.address.plain()}\n` +
        (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
        (output.namespaceId ? `  Namespace ID: ${output.namespaceId.fullName} (${output.namespaceId.toHex()})\n` : "") +
        `  Metadata Key: ${output.key?.toHex()}\n` +
        `  # of Aggregate TXs: ${output.batches.length}\n` +
        `  TX Fee: ${toXYM(Long.fromString(output.totalFee.toString()))} XYM\n` +
        `  Network Type: ${output.networkType}`
    );
};

export const writeOutputFile = (output: CommandlineOutput, filePath: string) => {
    fs.writeFileSync(
        filePath,
        JSON.stringify({
            version: VERSION,
            command: "scrap",
            metalId: output.metalId,
            networkType: output.networkType,
            sourceAddress: output.sourceAccount.address.plain(),
            targetAddress: output.targetAccount.address.plain(),
            key: output.key?.toHex(),
            ...(output.mosaicId && { mosaicId: output.mosaicId.toHex() }),
            ...(output.namespaceId && { namespaceId: output.namespaceId.fullName }),
            totalFee: output.totalFee.toString(),
            txs: output.batches.map((batch) => ({
                hash: batch.signedTx.hash,
                payload: Buffer.from(Convert.hexToUint8(batch.signedTx.payload)).toString("base64"),
                cosignatures: batch.cosignatures,
                maxFee: batch.maxFee.toString(),
            })),
        }),
        "utf-8"
    );
    console.log(`${filePath}: JSON data saved.`);
};