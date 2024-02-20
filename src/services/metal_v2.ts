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
import { MetalService as MetalServiceV1, Magic as MagicV1 } from "./compat";
import { metadataEntryConverter, SymbolService } from "./symbol";


const VERSION = 0x31;  // We should use above 0x30 to determine V1 or not
const HEADER_SIZE = 12;
export const CHUNK_PAYLOAD_MAX_SIZE = 1012;
const CHUNK_MAX_SIZE = 1024;

enum Magic {
    CHUNK = 0x00,  // Upper 1 bit 0
    END_CHUNK = 0x80,  // Upper 1 bits 1
}

enum Flag {
    MAGIC = 0x80,
    TEXT = 0x40,
}

const isMagic = (value: any): value is Magic => Object.values(Magic).includes(value);

export interface ChunkData {
    magic: Magic;
    checksum: UInt64;
    nextKey: UInt64;
    chunkPayload: Uint8Array;
    text: boolean;
}

export interface ChunkDataV1 extends ChunkData {
    version: 0x30;
    additive: Uint8Array;
}

export interface CHunkDataV2 extends ChunkData {
    version: 0x31;
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
    //       [magic 0 (Chunk) or 1 (End chunk) (1 bit)] +
    //       [text flag (1 bit)] +
    //       [reserve with 0 (6 bits)] +
    //       [version 0x31 (1 byte)] +
    //       [additive (16 bits unsigned integer = 2 bytes)] +
    //       [next key (when magic is 0 "Chunk"), file hash (when magic is 1 "End chunk") (64 bits = 8 bytes)] +
    //       [payload 1012 bytes] = 1024 bytes
    //   - key: Hash of value
    private static packChunkBytes(
        magic: Magic,
        version: number,
        additive: number,
        nextKey: UInt64,
        chunkBytes: Uint8Array,
        text?: boolean,
    ) {
        assert(additive >= 0 && additive < 65536);
        const value = new Uint8Array(HEADER_SIZE + chunkBytes.length);
        assert(value.length <= CHUNK_MAX_SIZE);

        // Header (12 bytes)
        const flags = magic & Flag.MAGIC |
            (text ? Flag.TEXT : 0);
        value.set([ flags ], 0);  // magic 1 bit + flags 1 bit + reserve 6 bits
        value.set([ version & 0xFF ], 1);  // version 1 byte
        value.set(new Uint8Array(new Uint16Array([ additive & 0xFFFF ]).buffer), 2);  // additive 2 bytes
        value.set(Convert.hexToUint8(nextKey.toHex()), 4);  // next key 8 bytes

        // Payload (max 1,012 bytes)
        if (chunkBytes.length) {
            value.set(chunkBytes, HEADER_SIZE);
        }

        // key's length will always be 8 bytes
        const key = MetalServiceV2.generateMetadataKey(value);

        return { value, key };
    }

    private static combinePayloadWithText(payload: Uint8Array, text?: string) {
        const textBytes = text ? Convert.utf8ToUint8(text) : new Uint8Array(0);
        const textSize = textBytes.length % CHUNK_PAYLOAD_MAX_SIZE
            ? textBytes.length + 1 // If text section end at mid-chunk then append null char
            : textBytes.length;

        const combinedPayload = new Uint8Array(textSize + payload.length);
        let offset = 0;

        if (textBytes.length) {
            combinedPayload.set(textBytes, offset);
            offset += textBytes.length;
        }
        if (textBytes.length % CHUNK_PAYLOAD_MAX_SIZE) {
            // Append null char as terminator
            combinedPayload.set([ 0x00 ], offset);
            offset++;
        }
        if (payload.length) {
            combinedPayload.set(payload, offset);
        }

        return {
            combinedPayload,
            textChunks: Math.ceil(textBytes.length / CHUNK_PAYLOAD_MAX_SIZE),
        };
    }

    // Calculate metadata key from payload. "additive" must be specified when using non-default one.
    public static calculateMetadataKey(
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE,
        text?: string,
    ) {
        const { combinedPayload, textChunks } = MetalServiceV2.combinePayloadWithText(payload, text);

        const chunks = Math.ceil(combinedPayload.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey = MetalServiceV2.generateChecksum(combinedPayload);
        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = combinedPayload.subarray(i * CHUNK_PAYLOAD_MAX_SIZE, (i + 1) * CHUNK_PAYLOAD_MAX_SIZE);
            nextKey = MetalServiceV2.packChunkBytes(
                magic,
                VERSION,
                additive,
                nextKey,
                chunkBytes,
                i < textChunks,
            ).key;
        }

        return nextKey;
    }

    // Verify metadata key with calculated one. "additive" must be specified when using non-default one.
    public static verifyMetadataKey(
        key: UInt64,
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE,
        text?: string,
    ) {
        return MetalServiceV2.calculateMetadataKey(payload, additive, text).equals(key);
    }

    public static extractChunk(chunk: BinMetadataEntry): ChunkDataV1 | CHunkDataV2 | undefined {
        const header = chunk.value.subarray(0, 2);  // 2 bytes

        const version = header[1];  // Last 1 byte of header
        if (version !== VERSION) {
            // Call V1 method
            const result = MetalServiceV1.extractChunk(metadataEntryConverter.fromBin(chunk));
            // Convert V2 result format
            return result && {
                ...result,
                magic: result.magic === MagicV1.END_CHUNK ? Magic.END_CHUNK : Magic.CHUNK,
                version: 0x30,
                nextKey: UInt64.fromHex(result.nextKey),
                // The chunk is partial data. Decoding base64 will be occurred in end of decode()
                chunkPayload: Convert.utf8ToUint8(result.chunkPayload),
                text: false,
            };
        }

        const magic = header[0] & Flag.MAGIC;  // First 1 bit of header
        if (!isMagic(magic)) {
            Logger.error(`Error: Malformed header magic ${magic}`);
            return undefined;
        }


        const checksum = MetalServiceV2.generateMetadataKey(chunk.value);
        if (!checksum.equals(chunk.scopedMetadataKey)) {
            Logger.error(
                `Error: The chunk ${chunk.scopedMetadataKey.toHex()} is broken ` +
                `(calculated=${checksum.toHex()})`
            );
            return undefined;
        }

        const text = !!(header[0] & Flag.TEXT);
        const additive = new Uint16Array(chunk.value.buffer.slice(2, 4))[0];
        const nextKey = UInt64.fromHex(Convert.uint8ToHex(chunk.value.subarray(4, HEADER_SIZE)));
        const chunkPayload = chunk.value.subarray(HEADER_SIZE, CHUNK_MAX_SIZE);

        return {
            magic,
            version: VERSION,
            checksum,
            nextKey,
            chunkPayload,
            additive,
            text,
        };
    }

    private static splitChunkPayloadAndText(chunkData: ChunkData) {
        if (!chunkData.text) {
            // No text in the chunk
            return {
                chunkPayload: chunkData.chunkPayload,
                chunkText: undefined,
            };
        }

        // Extract text section until null char is encountered.
        const textBytes = new Array<number>();
        for (let i = 0; i < chunkData.chunkPayload.length && chunkData.chunkPayload[i]; i++) {
            textBytes.push(chunkData.chunkPayload[i]);
        }

        return {
            chunkPayload: new Uint8Array(chunkData.chunkPayload.subarray(textBytes.length + 1)),
            chunkText: new Uint8Array(textBytes),
        };
    }

    // Returns:
    //   - payload: Decoded payload bytes.
    //   - text: Decoded text as string or undefined if no text
    //   - headChunk: First chunk data
    public static decode(key: UInt64, metadataPool: BinMetadata[]) {
        const lookupTable = MetalServiceV2.createMetadataLookupTable(metadataPool);

        let headChunk: ChunkDataV1 | CHunkDataV2 | undefined = undefined;
        let decodedPayload = new Uint8Array();
        let decodedText = new Uint8Array();
        let currentKeyHex = key.toHex();
        let magic: Magic | undefined;
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
            headChunk ??= result;
            if (headChunk?.version !== result.version) {
                Logger.error(`Error: Inconsistent chunk versions.`);
                break;
            }

            magic = result.magic;
            currentKeyHex = result.nextKey.toHex();

            const { chunkPayload, chunkText } = MetalServiceV2.splitChunkPayloadAndText(result);

            if (chunkPayload.length) {
                const payloadBuffer = new Uint8Array(decodedPayload.length + chunkPayload.length);
                payloadBuffer.set(decodedPayload);
                payloadBuffer.set(chunkPayload, decodedPayload.length);
                decodedPayload = payloadBuffer;
            }

            if (chunkText?.length) {
                const textBuffer = new Uint8Array(decodedText.length + chunkText.length);
                textBuffer.set(decodedText);
                textBuffer.set(chunkText, decodedText.length);
                decodedText = textBuffer;
            }
        } while (magic !== Magic.END_CHUNK);

        return {
            payload: !headChunk?.version || headChunk.version === VERSION
                ? decodedPayload
                // Decoded bytes is base64 encoded (utf-8)
                : Base64.toUint8Array(Convert.uint8ToUtf8(decodedPayload)),
            text: decodedText.length ? Convert.uint8ToUtf8(decodedText) : undefined,
            headChunk,
        };
    }

    constructor(public readonly symbolService: SymbolService) {
    }

    // Returns:
    //   - key: Metadata key of first chunk (*undefined* when no transactions were created)
    //   - txs: List of metadata transaction (*InnerTransaction* for aggregate tx)
    //   - additive: Actual additive that been used during encoding. We should store this for verifying the metal.
    public async createForgeTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive?: number,
        metadataPool?: BinMetadata[],
    ): Promise<{ key: UInt64, txs: InnerTransaction[], additive: number }>;

    // Overload for V2 + text
    public async createForgeTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive?: number,
        text?: string,
        metadataPool?: BinMetadata[],
    ): Promise<{ key: UInt64, txs: InnerTransaction[], additive: number }>;

    public async createForgeTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE,
        arg1?: string | BinMetadata[],
        arg2?: BinMetadata[],
    ): Promise<{ key: UInt64, txs: InnerTransaction[], additive: number }> {
        const text = typeof(arg1) === "string" ? arg1 : undefined;
        const metadataPool = Array.isArray(arg1) ? arg1 : arg2;

        const lookupTable = MetalServiceV2.createMetadataLookupTable(metadataPool);
        const txs = new Array<InnerTransaction>();
        const keys = new Array<string>();
        const { combinedPayload, textChunks } = MetalServiceV2.combinePayloadWithText(payload, text);
        const chunks = Math.ceil(combinedPayload.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey = MetalServiceV2.generateChecksum(combinedPayload);

        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = combinedPayload.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { value, key } = MetalServiceV2.packChunkBytes(
                magic,
                VERSION,
                additive,
                nextKey,
                chunkBytes,
                i < textChunks
            );

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
                    text,
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
            metadataPool ??
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
        additive?: number,
        metadataPool?: BinMetadata[],
    ): Promise<InnerTransaction[]>;

    // Overload for V2 + text
    public async createDestroyTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive?: number,
        text?: string,
        metadataPool?: BinMetadata[],
    ): Promise<InnerTransaction[]>;

    public async createDestroyTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive = MetalServiceV2.DEFAULT_ADDITIVE,
        arg1?: string | BinMetadata[],
        arg2?: BinMetadata[],
    ) {
        const text = typeof(arg1) === "string" ? arg1 : undefined;
        const metadataPool = Array.isArray(arg1) ? arg1 : arg2;

        const lookupTable = MetalServiceV2.createMetadataLookupTable(
            metadataPool ??
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchBinMetadata(type,{
                source: sourcePubAccount,
                target: targetPubAccount,
                targetId
            })
        );
        const scrappedValueBytes = new Uint8Array(0);
        const { combinedPayload, textChunks } = MetalServiceV2.combinePayloadWithText(payload, text);
        const chunks = Math.ceil(combinedPayload.length / CHUNK_PAYLOAD_MAX_SIZE);
        const txs = new Array<InnerTransaction>();
        let nextKey = MetalServiceV2.generateChecksum(combinedPayload);

        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = combinedPayload.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { key } = MetalServiceV2.packChunkBytes(
                magic,
                VERSION,
                additive,
                nextKey,
                chunkBytes,
                i < textChunks
            );

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
            metadataPool ??
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

    // Verify payload only
    public async verify(
        payload: Uint8Array,
        type: MetadataType,
        sourceAddress: Address,
        targetAddress: Address,
        key: UInt64,
        targetId?: MosaicId | NamespaceId,
        metadataPool?: BinMetadata[],
    ) {
        const { payload: decodedPayload } = MetalServiceV2.decode(
            key,
            metadataPool ??
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchBinMetadata(
                type,
                { source: sourceAddress, target: targetAddress, targetId }
            )
        ) ?? "";

        let mismatches = 0;
        const maxLength = Math.max(payload.length, decodedPayload.length);
        for (let i = 0; i < maxLength; i++) {
            if (payload[i] !== decodedPayload[i]) {
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

    // Returns
    //   - payload: Decoded payload bytes.
    //   - text: Decoded text as string or undefined if no text
    //   - headChunk: First chunk data.
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
    //   - headChunk: First chunk data.
    //   - payload: Decoded payload bytes.
    //   - text: Decoded text as string or undefined if no text
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

        const { payload, text, headChunk } = await this.fetch(
            metadataEntry.metadataType,
            metadataEntry.sourceAddress,
            metadataEntry.targetAddress,
            metadataEntry.targetId,
            metadataEntry.scopedMetadataKey,
        );

        return {
            headChunk,
            payload,
            text,
            type: metadataEntry.metadataType,
            sourceAddress: metadataEntry.sourceAddress,
            targetAddress: metadataEntry.targetAddress,
            targetId: metadataEntry.targetId,
            key: metadataEntry.scopedMetadataKey,
        };
    }
}
