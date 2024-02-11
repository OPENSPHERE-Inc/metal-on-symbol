import { BinMetadata, BinMetadataEntry } from "@opensphere-inc/symbol-service";
import assert from "assert";
import { Base64 } from "js-base64";
import {
    Account,
    AccountMetadataTransaction,
    Address,
    Convert,
    InnerTransaction,
    MetadataType,
    MosaicId,
    MosaicMetadataTransaction,
    NamespaceId,
    NamespaceMetadataTransaction,
    PublicAccount,
    TransactionType,
    UInt64,
} from "symbol-sdk";
import { Logger } from "../libs";
import { MetalService as MetalServiceV1 } from "./compat";
import { metadataEntryConverter, SymbolService } from "./symbol";


const VERSION: [ number, number ] = [ 1, 0 ];
const HEADER_SIZE = 13;
const CHUNK_PAYLOAD_MAX_SIZE = 1011;

enum Magic {
    CHUNK = "C",
    END_CHUNK = "E",
}

const isMagic = (value: any): value is Magic => Object.values(Magic).includes(value);

export interface ChunkData {
    magic: Magic;
    checksum: UInt64;
    nextKey: UInt64;
    chunkPayload: Uint8Array;
}

export interface ChunkDataV1 extends ChunkData {
    version: 1;
    additive: Uint8Array;
}

export interface CHunkDataV2 extends ChunkData {
    version: 2;
    additive: number;
}

export class MetalServiceV2 {
    public static DEFAULT_ADDITIVE = 0;

    public static generateMetadataKey = MetalServiceV1.generateMetadataKey;
    public static generateChecksum = MetalServiceV1.generateChecksum;
    public static restoreMetadataHash = MetalServiceV1.restoreMetadataHash;
    public static calculateMetalId = MetalServiceV1.calculateMetalId;

    public static generateRandomAdditive() {
        return Math.floor(0xFFFF * Math.random());
    }

    protected static createMetadataLookupTable(metadataPool?: BinMetadata[]) {
        // Map key is hex string
        const lookupTable =  new Map<string, BinMetadata>();
        metadataPool?.forEach(
            (metadata) => lookupTable.set(metadata.metadataEntry.scopedMetadataKey.toHex(), metadata)
        );
        return lookupTable;
    }

    // Returns:
    //   - value:
    //       [magic 0x43 ("C") or 0x45 ("E") (1 byte)] +
    //       [version 0x01 0x00 (8 bits + 8 bits = 2 bytes)] +
    //       [additive (16 bits unsigned integer = 2 bytes)] +
    //       [next key (when magic is "C"), file hash (when magic is "E") (64 bits = 8 bytes)] +
    //       [payload (1011 bytes)] = 1024 bytes
    //   - key: Hash of value
    private static packChunkBytes(
        magic: Magic,
        version: [ number, number ],
        additive: number,
        nextKey: UInt64,
        chunkBytes: Uint8Array,
    ) {
        assert(additive >= 0 && additive < 65536);
        const value = new Uint8Array(chunkBytes.length + HEADER_SIZE);
        assert(value.length <= 1024);

        // Header (14 bytes)
        value.set(Convert.utf8ToUint8(magic), 0);  // magic 1 byte
        value.set(version, 1);  // version 2 bytes
        value.set(new Uint8Array(new Uint16Array([ additive ]).buffer), 3);  // additive 2 bytes
        value.set(Convert.hexToUint8(nextKey.toHex()), 5);  // next key 8 bytes

        // Payload (max 1011 bytes)
        value.set(chunkBytes, HEADER_SIZE);

        // key's length will always be 16 bytes
        const key = MetalServiceV2.generateMetadataKey(value);

        return { value, key };
    }

    // Calculate metadata key from payload. "additive" must be specified when using non-default one.
    public static calculateMetadataKey(payload: Uint8Array, additive = MetalServiceV2.DEFAULT_ADDITIVE) {
        const chunks = Math.ceil(payload.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey = MetalServiceV2.generateChecksum(payload);
        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = payload.subarray(i * CHUNK_PAYLOAD_MAX_SIZE, (i + 1) * CHUNK_PAYLOAD_MAX_SIZE);
            nextKey = MetalServiceV2.packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes).key;
        }

        return nextKey;
    }

    // Verify metadata key with calculated one. "additive" must be specified when using non-default one.
    public static verifyMetadataKey(
        key: UInt64,
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE
    ) {
        return MetalServiceV2.calculateMetadataKey(payload, additive).equals(key);
    }

    public static extractChunk(chunk: BinMetadataEntry): ChunkDataV1 | CHunkDataV2 | undefined {
        const magic = String.fromCharCode(chunk.value[0]);
        if (!isMagic(magic)) {
            Logger.error(`Error: Malformed header magic ${magic}`);
            return undefined;
        }

        const version = chunk.value.subarray(1, 3);
        if (version.toString() !== VERSION.toString()) {
            // Call V1 method
            const result = MetalServiceV1.extractChunk(metadataEntryConverter.fromBin(chunk));
            // Convert V2 result format
            return result && {
                ...result,
                magic,
                version: 1,
                nextKey: UInt64.fromHex(result.nextKey),
                // The chunk is partial data. Decoding base64 will be occurred in end of decode()
                chunkPayload: Convert.utf8ToUint8(result.chunkPayload),
            };
        }

        const checksum = MetalServiceV2.generateMetadataKey(chunk.value);
        if (!checksum.equals(chunk.scopedMetadataKey)) {
            Logger.error(
                `Error: The chunk ${chunk.scopedMetadataKey.toHex()} is broken ` +
                `(calculated=${checksum.toHex()})`
            );
            return undefined;
        }

        const additive = new Uint16Array(chunk.value.buffer.slice(3, 5))[0];
        const nextKey = UInt64.fromHex(Convert.uint8ToHex(chunk.value.subarray(5, HEADER_SIZE)));
        const chunkPayload = chunk.value.subarray(HEADER_SIZE, HEADER_SIZE + CHUNK_PAYLOAD_MAX_SIZE);

        return {
            magic,
            version: 2,
            checksum,
            nextKey,
            chunkPayload,
            additive,
        };
    }

    // Return: Decoded payload bytes.
    public static decode(key: UInt64, metadataPool: BinMetadata[]) {
        const lookupTable = MetalServiceV2.createMetadataLookupTable(metadataPool);

        let decodedBytes = new Uint8Array();
        let currentKeyHex = key.toHex();
        let magic = "";
        let version: number | undefined;
        do {
            const metadata = lookupTable.get(currentKeyHex)?.metadataEntry;
            if (!metadata) {
                Logger.error(`Error: The chunk ${currentKeyHex} lost`);
                break;
            }
            lookupTable.delete(currentKeyHex);  // Prevent loop

            const result = MetalServiceV2.extractChunk(metadata);
            if (!result) {
                break;
            }
            if (version && version.toString() !== result.version.toString()) {
                Logger.error(`Error: Inconsistent chunk versions.`);
                break;
            }

            version = result.version;
            magic = result.magic;
            currentKeyHex = result.nextKey.toHex();

            const buffer = new Uint8Array(decodedBytes.length + result.chunkPayload.length);
            buffer.set(decodedBytes);
            buffer.set(result.chunkPayload, decodedBytes.length);
            decodedBytes = buffer;
        } while (magic !== Magic.END_CHUNK);

        return !version || version === 2
            ? decodedBytes
            // Decoded bytes is base64 encoded (utf-8)
            : Base64.toUint8Array(Convert.uint8ToUtf8(decodedBytes));
    }

    constructor(public readonly symbolService: SymbolService) {
    }

    // Returns:
    //   - key: Metadata key of first chunk (*undefined* when no transactions were created)
    //   - txs: List of metadata transaction (*InnerTransaction* for aggregate tx)
    //   - additive: Actual additive that been used during encoding. You should store this for verifying the metal.
    public async createForgeTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE,
        metadataPool?: BinMetadata[],
    ): Promise<{ key: UInt64, txs: InnerTransaction[], additive: number }> {
        const lookupTable = MetalServiceV2.createMetadataLookupTable(metadataPool);
        const txs = new Array<InnerTransaction>();
        const keys = new Array<string>();

        const chunks = Math.ceil(payload.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey = MetalServiceV2.generateChecksum(payload);

        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = payload.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { value, key } = MetalServiceV2.packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes);

            if (keys.includes(key.toHex())) {
                Logger.warn(`Warning: Scoped key "${key.toHex()}" has been conflicted. ` +
                    `Trying another additive.`);
                // Retry with another additive via recursive call
                return this.createForgeTxs(
                    type,
                    sourcePubAccount,
                    targetPubAccount,
                    targetId,
                    payload,
                    MetalServiceV2.generateRandomAdditive(),
                    metadataPool,
                );
            }

            // Only non on-chain data to be announced.
            !lookupTable.has(key.toHex()) && txs.push(await this.symbolService.createMetadataTx(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                key,
                value,
            ));
            keys.push(key.toHex());

            nextKey = key;
        }

        return {
            key: nextKey,
            txs: txs.reverse(),
            additive,
        };
    }

    // Scrap metal via removing metadata
    public async createScrapTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        key: UInt64,
        metadataPool?: BinMetadata[],
    ) {
        const lookupTable = MetalServiceV2.createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchBinMetadata(type, {
                source: sourcePubAccount,
                target: targetPubAccount,
                targetId,
            })
        );

        const scrappedValueBytes = new Uint8Array(0);
        const txs = new Array<InnerTransaction>();
        let currentKeyHex = key.toHex();
        let magic: Magic | undefined;

        do {
            const metadata = lookupTable.get(currentKeyHex)?.metadataEntry;
            if (!metadata) {
                Logger.error(`Error: The chunk ${currentKeyHex} lost.`);
                return undefined;
            }
            lookupTable.delete(currentKeyHex);  // Prevent loop

            const chunk = MetalServiceV2.extractChunk(metadata);
            if (!chunk) {
                return undefined;
            }

            txs.push(await this.symbolService.createMetadataTx(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                metadata.scopedMetadataKey,
                // FIXME: Unnecessary hex conversion.
                Convert.hexToUint8(Convert.xor(metadata.value, scrappedValueBytes)),
                scrappedValueBytes.length - metadata.value.length,
            ));

            magic = chunk.magic;
            currentKeyHex = chunk.nextKey.toHex();
        } while (magic !== Magic.END_CHUNK);

        return txs;
    }

    public async createDestroyTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE,
        metadataPool?: BinMetadata[],
    ) {
        const lookupTable = MetalServiceV2.createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchBinMetadata(type,{
                source: sourcePubAccount,
                target: targetPubAccount,
                targetId
            })
        );
        const scrappedValueBytes = new Uint8Array(0);
        const chunks = Math.ceil(payload.length / CHUNK_PAYLOAD_MAX_SIZE);
        const txs = new Array<InnerTransaction>();
        let nextKey = MetalServiceV2.generateChecksum(payload);

        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = payload.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { key } = MetalServiceV2.packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes);

            const onChainMetadata = lookupTable.get(key.toHex());
            if (onChainMetadata) {
                // Only on-chain data to be announced.
                txs.push(await this.symbolService.createMetadataTx(
                    type,
                    sourcePubAccount,
                    targetPubAccount,
                    targetId,
                    key,
                    // FIXME: Unnecessary hex conversion
                    Convert.hexToUint8(Convert.xor(onChainMetadata.metadataEntry.value, scrappedValueBytes)),
                    scrappedValueBytes.length - onChainMetadata.metadataEntry.value.length,
                ));
            } else {
                console.warn(`${key.toHex()}: The chunk has no on-chain data.`);
            }

            nextKey = key;
        }

        return txs.reverse();
    }

    public async checkCollision(
        txs: InnerTransaction[],
        type: MetadataType,
        source: Account | PublicAccount | Address,
        target: Account | PublicAccount | Address,
        targetId?: MosaicId | NamespaceId,
        metadataPool?: BinMetadata[],
    ) {
        const lookupTable = MetalServiceV2.createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchBinMetadata(type,  { source, target, targetId })
        );
        const collisions = new Array<UInt64>();

        const metadataTxTypes = [
            TransactionType.ACCOUNT_METADATA,
            TransactionType.MOSAIC_METADATA,
            TransactionType.NAMESPACE_METADATA
        ];
        type MetadataTransaction = AccountMetadataTransaction |
            MosaicMetadataTransaction |
            NamespaceMetadataTransaction;

        if (type === MetadataType.Account) {
            for (const tx of txs) {
                if (!metadataTxTypes.includes(tx.type)) {
                    continue;
                }
                let  metadataTx = tx as MetadataTransaction;
                const keyHex = metadataTx.scopedMetadataKey.toHex();
                if (lookupTable.has(keyHex)) {
                    Logger.warn(`${keyHex}: Already exists on the chain.`);
                    collisions.push(metadataTx.scopedMetadataKey);
                }
            }
        }

        return collisions;
    }

    public async verify(
        payload: Uint8Array,
        type: MetadataType,
        sourceAddress: Address,
        targetAddress: Address,
        key: UInt64,
        targetId?: MosaicId | NamespaceId,
        metadataPool?: BinMetadata[],
    ) {
        const decodedBytes = MetalServiceV2.decode(
            key,
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchBinMetadata(
                type,
                { source: sourceAddress, target: targetAddress, targetId }
            )
        ) || "";

        let mismatches = 0;
        const maxLength = Math.max(payload.length, decodedBytes.length);
        for (let i = 0; i < maxLength; i++) {
            if (payload[i] !== decodedBytes[i]) {
                mismatches++;
            }
        }

        return {
            maxLength,
            mismatches,
        };
    }

    public async getFirstChunk(metalId: string) {
        return this.symbolService.getBinMetadataByHash(MetalServiceV2.restoreMetadataHash(metalId));
    }

    public async fetch(
        type: MetadataType,
        source: Address | Account | PublicAccount,
        target: Address | Account | PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        key: UInt64,
    ) {
        const metadataPool = await this.symbolService.searchBinMetadata(type, { source, target, targetId });
        return MetalServiceV2.decode(key, metadataPool);
    }

    // Returns:
    //   - payload: Decoded metal contents
    //   - type: Metadata type
    //   - sourceAddress: Metadata source address
    //   - targetAddress: Metadata target address
    //   - targetId: Metadata target ID (NamespaceId, MosaicId or undefined for account)
    //   - key: Metadata key
    public async fetchByMetalId(
        metalId: string,
    ) {
        const metadata = await this.getFirstChunk(metalId);
        const metadataEntry = metadata.metadataEntry;

        const payload = await this.fetch(
            metadataEntry.metadataType,
            metadataEntry.sourceAddress,
            metadataEntry.targetAddress,
            metadataEntry.targetId,
            metadataEntry.scopedMetadataKey,
        );

        return {
            payload,
            type: metadataEntry.metadataType,
            sourceAddress: metadataEntry.sourceAddress,
            targetAddress: metadataEntry.targetAddress,
            targetId: metadataEntry.targetId,
            key: metadataEntry.scopedMetadataKey,
        };
    }
}
