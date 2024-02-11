import fs from "fs";
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
import { Logger } from "../../libs";
import { AggregateUndeadTransaction, MetadataTransaction, SignedAggregateTx, UndeadSignature } from "../../services";


export const VERSION = "2.1";
export const SUPPORTED_VERSION = /^2\.[0-1]$/;

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
    txs?: {
        // Extracted metadata keys
        keys: string[];
        maxFee: number[];
        // Tx deadline to retrieve transaction
        deadline: number;
        hash: string;
        cosignatures: {
            parentHash: string;
            signature: string;
            signerPublicKey: string;
        }[];
        // Tx signature instead of tx payload to reduce file size
        signature: string;
    }[];
    undeadTxs?: {
        // Extracted metadata keys
        keys: string[];
        maxFee: number[];
        nonce: number[];
        signatures: UndeadSignature[];
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
    batches?: SignedAggregateTx[];
    undeadBatches?: AggregateUndeadTransaction[];
    signerPubAccount: PublicAccount;
    totalFee: UInt64;
    additive: string;
    metalId: string;
    createdAt: Date;
}

const extractMetadataKey = (tx: AggregateTransaction) => {
    const metadataTypes = [
        TransactionType.ACCOUNT_METADATA,
        TransactionType.MOSAIC_METADATA,
        TransactionType.NAMESPACE_METADATA
    ];
    return tx.innerTransactions.map(
        (innerTx) => {
            if (!metadataTypes.includes(innerTx.type)) {
                throw new Error("The transaction type must be account/mosaic/namespace metadata.");
            }
            return (innerTx as MetadataTransaction).scopedMetadataKey.toHex();
        }
    );
};

const batchToIntermediateTx = (batch: SignedAggregateTx) => {
    const tx = AggregateTransaction.createFromPayload(batch.signedTx.payload);
    return {
        hash: batch.signedTx.hash,
        maxFee: batch.maxFee.toDTO(),
        cosignatures: batch.cosignatures.map((cosignature) => ({
            parentHash: cosignature.parentHash,
            signature: cosignature.signature,
            signerPublicKey: cosignature.signerPublicKey,
        })),
        deadline: tx.deadline.adjustedValue,
        keys: extractMetadataKey(tx),
        signature: tx.signature || "",
    };
};

const batchToIntermediateUndeadTx = (batch: AggregateUndeadTransaction) => {
    const nonceHex = batch.nonce.toHex();
    return {
        // Exclude lock metadata transaction.
        keys: extractMetadataKey(batch.aggregateTx).filter((key) => key !== nonceHex),
        maxFee: batch.aggregateTx.maxFee.toDTO(),
        nonce: batch.nonce.toDTO(),
        signatures: batch.signatures,
    };
}

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
        txs: output.batches?.map((batch) => batchToIntermediateTx(batch)),
        undeadTxs: output.undeadBatches?.map((batch) => batchToIntermediateUndeadTx(batch)),
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
    if (!intermediateTxs.version.match(SUPPORTED_VERSION)) {
        throw new Error(`${filePath}: Unsupported version ${intermediateTxs.version}`);
    }

    return intermediateTxs;
};


