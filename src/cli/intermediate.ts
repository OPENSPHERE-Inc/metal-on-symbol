import {
    AggregateTransaction,
    MetadataType,
    MosaicId,
    NamespaceId,
    NetworkType,
    PublicAccount,
    TransactionType,
    UInt64
} from "symbol-sdk";
import {Logger} from "../libs";
import {SignedAggregateTx} from "../services";
import fs from "fs";
import {MetadataTransaction} from "../../symbol-service";


export const VERSION = "2.0";

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
    totalFee: number[];
    additive: string;
    signerPublicKey: string;
    txs: {
        // Tx deadline to retrieve transaction
        deadline: number;
        hash: string;
        maxFee: number[];
        cosignatures: {
            parentHash: string;
            signature: string;
            signerPublicKey: string;
        }[];
        // Extracted metadata keys
        keys: string[];
        // Tx signature instead of tx payload to reduce file size
        signature: string;
    }[];
    createdAt: string;
    updatedAt: string;
}

export interface IntermediateOutput {
    command: "forge" | "scrap";
    type: MetadataType;
    sourcePubAccount: PublicAccount;
    targetPubAccount: PublicAccount;
    key?: UInt64;
    mosaicId?: MosaicId;
    namespaceId?: NamespaceId;
    networkType: NetworkType;
    batches: SignedAggregateTx[];
    signerPubAccount: PublicAccount;
    totalFee: UInt64;
    additive: string;
    metalId: string;
    createdAt: Date;
}

const batchToIntermediateTx = (batch: SignedAggregateTx) => {
    const tx = AggregateTransaction.createFromPayload(batch.signedTx.payload);
    const metadataTypes = [
        TransactionType.ACCOUNT_METADATA,
        TransactionType.MOSAIC_METADATA,
        TransactionType.NAMESPACE_METADATA
    ];
    return {
        hash: batch.signedTx.hash,
        maxFee: batch.maxFee.toDTO(),
        cosignatures: batch.cosignatures.map((cosignature) => ({
            parentHash: cosignature.parentHash,
            signature: cosignature.signature,
            signerPublicKey: cosignature.signerPublicKey,
        })),
        deadline: tx.deadline.adjustedValue,
        keys: tx.innerTransactions.map(
            (innerTx) => {
                if (!metadataTypes.includes(innerTx.type)) {
                    throw new Error("The transaction type must be account/mosaic/namespace metadata.");
                }
                return (innerTx as MetadataTransaction).scopedMetadataKey.toHex();
            }
        ),
        signature: tx.signature || "",
    };
};

export const writeIntermediateFile = (output: Readonly<IntermediateOutput>, filePath: string) => {
    const intermediateTxs: IntermediateTxs = {
        version: VERSION,
        command: output.command,
        metalId: output.metalId,
        networkType: output.networkType,
        type: output.type,
        sourcePublicKey: output.sourcePubAccount.publicKey,
        targetPublicKey: output.targetPubAccount.publicKey,
        key: output.key?.toHex(),
        ...(output.mosaicId && { mosaicId: output.mosaicId.toHex() }),
        ...(output.namespaceId && { namespaceId: output.namespaceId.toHex() }),
        totalFee: output.totalFee.toDTO(),
        additive: output.additive,
        signerPublicKey: output.signerPubAccount.publicKey,
        txs: output.batches.map((batch) => batchToIntermediateTx(batch)),
        createdAt: output.createdAt.toISOString(),
        updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(filePath, JSON.stringify(intermediateTxs),"utf-8");
    Logger.debug(`${filePath}: JSON data saved.`);
};

export const readIntermediateFile = (filePath: string) => {
    Logger.debug(`${filePath}: Reading...`);
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


