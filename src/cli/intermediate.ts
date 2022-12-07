import {Convert, MetadataType, MosaicId, NamespaceId, NetworkType, PublicAccount, UInt64} from "symbol-sdk";
import {SymbolService} from "../services";
import fs from "fs";
import { Base64 } from "js-base64";
import {Logger} from "../libs";


export const VERSION = "1.0";

export interface IntermediateTxs {
    version: string;
    command: "forge"  | "scrap";
    metalId: string;
    networkType: NetworkType;
    type: MetadataType;
    sourcePublicKey: string;
    targetPublicKey: string;
    key?: string;
    mosaicId?: string;
    namespaceId?: string;
    totalFee: string;
    additive: string;
    signerPublicKey: string;
    txs: {
        hash: string;
        maxFee: string;
        cosignatures: {
            parentHash: string;
            signature: string;
            signerPublicKey: string;
        }[];
        payload: string;
    }[];
    createdAt: string;
    updatedAt: string;
}

export interface IntermediateOutput {
    command: "forge" | "scrap";
    type: MetadataType;
    sourceAccount: PublicAccount;
    targetAccount: PublicAccount;
    key?: UInt64;
    mosaicId?: MosaicId;
    namespaceId?: NamespaceId;
    networkType: NetworkType;
    batches: SymbolService.SignedAggregateTx[];
    signerAccount: PublicAccount;
    totalFee: UInt64;
    additive: string;
    metalId: string;
    createdAt: Date;
}

const batchToIntermediateTx = (batch: SymbolService.SignedAggregateTx) => ({
    hash: batch.signedTx.hash,
    maxFee: batch.maxFee.toString(),
    cosignatures: batch.cosignatures.map((cosignature) => ({
        parentHash: cosignature.parentHash,
        signature: cosignature.signature,
        signerPublicKey: cosignature.signerPublicKey,
    })),
    // Convert HEX to base64
    payload: Base64.fromUint8Array(Convert.hexToUint8(batch.signedTx.payload)),
});

export const writeIntermediateFile = (output: Readonly<IntermediateOutput>, filePath: string) => {
    const intermediateTxs: IntermediateTxs = {
        version: VERSION,
        command: output.command,
        metalId: output.metalId,
        networkType: output.networkType,
        type: output.type,
        sourcePublicKey: output.sourceAccount.publicKey,
        targetPublicKey: output.targetAccount.publicKey,
        key: output.key?.toHex(),
        ...(output.mosaicId && { mosaicId: output.mosaicId.toHex() }),
        ...(output.namespaceId && { namespaceId: output.namespaceId.toHex() }),
        totalFee: output.totalFee.toString(),
        additive: output.additive,
        signerPublicKey: output.signerAccount.publicKey,
        txs: output.batches.map((batch) => batchToIntermediateTx(batch)),
        createdAt: output.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(intermediateTxs),"utf-8");
    Logger.log(`${filePath}: JSON data saved.`);
};

export const readIntermediateFile = (filePath: string) => {
    Logger.log(`${filePath}: Reading...`);
    const intermediateJson = fs.readFileSync(filePath, "utf-8");
    if (!intermediateJson.length) {
        throw new Error(`${filePath}: The file is empty.`);
    }

    const intermediateTxs = JSON.parse(intermediateJson) as IntermediateTxs;
    if (intermediateTxs.version !== VERSION) {
        throw new Error(`${filePath}: Unsupported version ${intermediateTxs.version}`);
    }

    return intermediateTxs;
};


