import {
    Account,
    AccountMetadataTransaction,
    Address,
    Convert,
    InnerTransaction,
    Metadata,
    MetadataEntry,
    MetadataType,
    MosaicId,
    MosaicMetadataTransaction,
    NamespaceId,
    NamespaceMetadataTransaction,
    PublicAccount,
    TransactionType,
    UInt64,
} from "symbol-sdk";
import {SymbolService} from "../symbol";
import {Logger} from "../../libs";
import assert from "assert";
import {sha3_256} from "js-sha3";
import bs58 from "bs58";
import { Base64 } from "js-base64";


const VERSION = "010";
const HEADER_SIZE = 24;
const CHUNK_PAYLOAD_MAX_SIZE = 1000;
const METAL_ID_HEADER_HEX = "0B2A";

enum Magic {
    CHUNK = "C",
    END_CHUNK = "E",
}

const isMagic = (char: any): char is Magic => Object.values(Magic).includes(char);


export class MetalService {
    public static DEFAULT_ADDITIVE = Convert.utf8ToUint8("0000");

    // Use sha3_256 of first 64 bits, MSB should be 0
    public static generateMetadataKey(input: string | Uint8Array): UInt64 {
        if (input.length === 0) {
            throw new Error("Input must not be empty");
        }
        const buf = sha3_256.arrayBuffer(input);
        const result = new Uint32Array(buf);
        return new UInt64([result[0], result[1] & 0x7FFFFFFF]);
    }

    // Use sha3_256 of first 64 bits
    public static generateChecksum(input: Uint8Array): UInt64 {
        if (input.length === 0) {
            throw new Error("Input must not be empty");
        }
        const buf = sha3_256.arrayBuffer(input);
        const result = new Uint32Array(buf);
        return new UInt64([result[0], result[1]]);
    }

    public static generateRandomAdditive() {
        return Convert.utf8ToUint8(
            `000${Math.floor(Math.random() * 1679616).toString(36).toUpperCase()}`.slice(-4)
        );
    }

    // Return 46 bytes base58 string
    public static calculateMetalId(
        type: MetadataType,
        sourceAddress: Address,
        targetAddress: Address,
        targetId: undefined | MosaicId | NamespaceId,
        key: UInt64,
    ) {
        const compositeHash = SymbolService.calculateMetadataHash(
            type,
            sourceAddress,
            targetAddress,
            targetId,
            key
        );
        const hashBytes = Convert.hexToUint8(METAL_ID_HEADER_HEX + compositeHash);
        return bs58.encode(hashBytes);
    }

    // Return 64 bytes hex string
    public static restoreMetadataHash(
        metalId: string
    ) {
        const hashHex = Convert.uint8ToHex(
            bs58.decode(metalId)
        );
        if (!hashHex.startsWith(METAL_ID_HEADER_HEX)) {
            throw new Error("Invalid metal ID.");
        }
        return hashHex.slice(METAL_ID_HEADER_HEX.length);
    }

    protected static createMetadataLookupTable(metadataPool?: Metadata[]) {
        // Map key is hex string
        const lookupTable =  new Map<string, Metadata>();
        metadataPool?.forEach(
            (metadata) => lookupTable.set(metadata.metadataEntry.scopedMetadataKey.toHex(), metadata)
        );
        return lookupTable;
    }

    // Returns:
    //   - value:
    //       [magic "C" or "E" (1 byte)] +
    //       [version (3 bytes)] +
    //       [additive (4 bytes)] +
    //       [next key (when magic is "C"), file hash (when magic is "E") (16 bytes)] +
    //       [payload (1000 bytes)] = 1024 bytes
    //   - key: Hash of value
    protected static packChunkBytes(
        magic: Magic,
        version: string,
        additive: Uint8Array,
        nextKey: UInt64,
        chunkBytes: Uint8Array,
    ) {
        assert(additive.length >= 4);
        const value = new Uint8Array(chunkBytes.length + HEADER_SIZE);
        assert(value.length <= 1024);

        // Header (24 bytes)
        value.set(Convert.utf8ToUint8(magic.substring(0, 1)));
        value.set(Convert.utf8ToUint8(version.substring(0, 3)), 1);
        value.set(additive.subarray(0, 4), 4);
        value.set(Convert.utf8ToUint8(nextKey.toHex()), 8);

        // Payload (max 1000 bytes)
        value.set(chunkBytes, HEADER_SIZE);

        // key's length will always be 16 bytes
        const key = MetalService.generateMetadataKey(Convert.uint8ToUtf8(value));

        return { value, key };
    }

    // Calculate metadata key from payload. "additive" must be specified when using non-default one.
    public static calculateMetadataKey(payload: Uint8Array, additive: Uint8Array = MetalService.DEFAULT_ADDITIVE) {
        const payloadBase64Bytes = Convert.utf8ToUint8(Base64.fromUint8Array(payload));

        const chunks = Math.ceil(payloadBase64Bytes.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey: UInt64 = MetalService.generateChecksum(payload);
        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = payloadBase64Bytes.subarray(i * CHUNK_PAYLOAD_MAX_SIZE, (i + 1) * CHUNK_PAYLOAD_MAX_SIZE);
            nextKey = MetalService.packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes).key;
        }

        return nextKey;
    }

    // Verify metadata key with calculated one. "additive" must be specified when using non-default one.
    public static verifyMetadataKey(
        key: UInt64,
        payload: Uint8Array,
        additive: Uint8Array = MetalService.DEFAULT_ADDITIVE
    ) {
        return MetalService.calculateMetadataKey(payload, additive).equals(key);
    }

    public static extractChunk(chunk: MetadataEntry) {
        const magic = chunk.value.substring(0, 1);
        if (!isMagic(magic)) {
            Logger.error(`Error: Malformed header magic ${magic}`);
            return undefined;
        }

        const version = chunk.value.substring(1, 4);
        if (version !== VERSION) {
            Logger.error(`Error: Malformed header version ${version}`);
            return undefined;
        }

        const metadataValue = chunk.value;
        const checksum = MetalService.generateMetadataKey(metadataValue);
        if (!checksum.equals(chunk.scopedMetadataKey)) {
            Logger.error(
                `Error: The chunk ${chunk.scopedMetadataKey.toHex()} is broken ` +
                `(calculated=${checksum.toHex()})`
            );
            return undefined;
        }

        const additive = Convert.utf8ToUint8(metadataValue.substring(4, 8));
        const nextKey = metadataValue.substring(8, HEADER_SIZE);
        const chunkPayload = metadataValue.substring(HEADER_SIZE, HEADER_SIZE + CHUNK_PAYLOAD_MAX_SIZE);

        return {
            magic,
            version,
            checksum,
            nextKey,
            chunkPayload,
            additive,
        };
    }

    // Return: Decoded payload string.
    public static decode(key: UInt64, metadataPool: Metadata[]) {
        const lookupTable = MetalService.createMetadataLookupTable(metadataPool);

        let decodedString = "";
        let currentKeyHex = key.toHex();
        let magic = "";
        do {
            const metadata = lookupTable.get(currentKeyHex)?.metadataEntry;
            if (!metadata) {
                Logger.error(`Error: The chunk ${currentKeyHex} lost`);
                break;
            }
            lookupTable.delete(currentKeyHex);  // Prevent loop

            const result = MetalService.extractChunk(metadata);
            if (!result) {
                break;
            }

            magic = result.magic;
            currentKeyHex = result.nextKey;
            decodedString += result.chunkPayload;
        } while (magic !== Magic.END_CHUNK);

        return decodedString;
    }

    constructor(public readonly symbolService: SymbolService) {}

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
        additive: Uint8Array = MetalService.DEFAULT_ADDITIVE,
        metadataPool?: Metadata[],
    ): Promise<{ key: UInt64, txs: InnerTransaction[], additive: Uint8Array }> {
        const lookupTable = MetalService.createMetadataLookupTable(metadataPool);
        const payloadBase64Bytes = Convert.utf8ToUint8(Base64.fromUint8Array(payload));
        const txs = new Array<InnerTransaction>();
        const keys = new Array<string>();

        const chunks = Math.ceil(payloadBase64Bytes.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey: UInt64 = MetalService.generateChecksum(payload);
        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = payloadBase64Bytes.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { value, key } = MetalService.packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes);

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
                    MetalService.generateRandomAdditive(),
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
        metadataPool?: Metadata[],
    ) {
        const lookupTable = MetalService.createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchMetadata(type, {
                source: sourcePubAccount,
                target: targetPubAccount,
                targetId,
            })
        );

        const scrappedValueBytes = Convert.utf8ToUint8("");
        const txs = new Array<InnerTransaction>();
        let currentKeyHex = key.toHex();
        let magic: string | undefined;

        do {
            const metadata = lookupTable.get(currentKeyHex)?.metadataEntry;
            if (!metadata) {
                Logger.error(`Error: The chunk ${currentKeyHex} lost.`);
                return undefined;
            }
            lookupTable.delete(currentKeyHex);  // Prevent loop

            const chunk = MetalService.extractChunk(metadata);
            if (!chunk) {
                return undefined;
            }

            const valueBytes = Convert.utf8ToUint8(metadata.value);
            txs.push(await this.symbolService.createMetadataTx(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                metadata.scopedMetadataKey,
                Convert.hexToUint8(Convert.xor(valueBytes, scrappedValueBytes)),
                scrappedValueBytes.length - valueBytes.length,
            ));

            magic = chunk.magic;
            currentKeyHex = chunk.nextKey;
        } while (magic !== Magic.END_CHUNK);

        return txs;
    }

    public async createDestroyTxs(
        type: MetadataType,
        sourcePubAccount: PublicAccount,
        targetPubAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive: Uint8Array = MetalService.DEFAULT_ADDITIVE,
        metadataPool?: Metadata[],
    ) {
        const lookupTable = MetalService.createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchMetadata(
                type,
                { source: sourcePubAccount, target: targetPubAccount, targetId }
            )
        );
        const scrappedValueBytes = Convert.utf8ToUint8("");
        const payloadBase64Bytes = Convert.utf8ToUint8(Base64.fromUint8Array(payload));
        const chunks = Math.ceil(payloadBase64Bytes.length / CHUNK_PAYLOAD_MAX_SIZE);
        const txs = new Array<InnerTransaction>();
        let nextKey: UInt64 = MetalService.generateChecksum(payload);

        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? Magic.END_CHUNK : Magic.CHUNK;
            const chunkBytes = payloadBase64Bytes.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { key } = MetalService.packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes);

            const onChainMetadata = lookupTable.get(key.toHex());
            if (onChainMetadata) {
                // Only on-chain data to be announced.
                const valueBytes = Convert.utf8ToUint8(onChainMetadata.metadataEntry.value);
                txs.push(await this.symbolService.createMetadataTx(
                    type,
                    sourcePubAccount,
                    targetPubAccount,
                    targetId,
                    key,
                    Convert.hexToUint8(Convert.xor(valueBytes, scrappedValueBytes)),
                    scrappedValueBytes.length - valueBytes.length,
                ));
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
        metadataPool?: Metadata[],
    ) {
        const lookupTable = MetalService.createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchMetadata(type,  { source, target, targetId })
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
        metadataPool?: Metadata[],
    ) {
        const payloadBase64 = Base64.fromUint8Array(payload)
        const decodedBase64 = MetalService.decode(
            key,
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await this.symbolService.searchMetadata(
                type,
                { source: sourceAddress, target: targetAddress, targetId }
            )
        ) || "";

        let mismatches = 0;
        const maxLength = Math.max(payloadBase64.length, decodedBase64.length);
        for (let i = 0; i < maxLength; i++) {
            if (payloadBase64.charAt(i) !== decodedBase64?.charAt(i)) {
                mismatches++;
            }
        }

        return {
            maxLength,
            mismatches,
        };
    }

    public async getFirstChunk(metalId: string) {
        return this.symbolService.getMetadataByHash(MetalService.restoreMetadataHash(metalId));
    }

    public async fetch(
        type: MetadataType,
        source: Address | Account | PublicAccount,
        target: Address | Account | PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        key: UInt64,
    ) {
        const metadataPool = await this.symbolService.searchMetadata(type, { source, target, targetId });
        return Base64.toUint8Array(MetalService.decode(key, metadataPool));
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
