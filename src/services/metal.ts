import {
    Account,
    AccountMetadataTransaction, Address,
    Convert,
    InnerTransaction,
    Metadata,
    MetadataType,
    MosaicId, MosaicMetadataTransaction,
    NamespaceId, NamespaceMetadataTransaction,
    PublicAccount, TransactionType,
    UInt64
} from "symbol-sdk";
import {SymbolService} from "./symbol";
import assert from "assert";
import {sha3_256} from "js-sha3";
import bs58 from "bs58";


export namespace MetalService {
    const VERSION = "010";
    const DEFAULT_ADDITIVE = "0000";
    const HEADER_SIZE = 24;
    const CHUNK_PAYLOAD_MAX_SIZE = 1000;

    // Use sha3_256 of first 64 bits, MSB should be 0
    export const generateMetadataKey = (input: string): UInt64 => {
        if (input.length === 0) {
            throw Error("Input must not be empty");
        }
        const buf = sha3_256.arrayBuffer(input);
        const result = new Uint32Array(buf);
        return new UInt64([result[0], result[1] & 0x7FFFFFFF]);
    };

    // Use sha3_256 of first 64 bits
    export const generateHash = (input: Buffer): UInt64 => {
        if (input.length === 0) {
            throw Error("Input must not be empty");
        }
        const buf = sha3_256.arrayBuffer(input);
        const result = new Uint32Array(buf);
        return new UInt64([result[0], result[1]]);
    };

    export const generateRandomAdditive = () => {
        return Math.floor(Math.random() * 1679616).toString(36).toUpperCase();
    };

    // Return 44 bytes base58 string
    export const calculateMetalId = (
        type: MetadataType,
        sourceAddress: Address,
        targetAddress: Address,
        scopedMetadataKey: UInt64,
        targetId?: MosaicId | NamespaceId
    ) => {
        const hashBytes = Convert.hexToUint8(
            SymbolService.calculateMetadataHash(type, sourceAddress, targetAddress, scopedMetadataKey, targetId)
        );
        return bs58.encode(hashBytes);
    };

    // Return 64 bytes hex string
    export const restoreMetadataHash = (
        metalId: string
    ) => {
        return Convert.uint8ToHex(
            bs58.decode(`${metalId}`)
        );
    };

    // Returns:
    //   - value:
    //       [magic "M","C" or "E" (1 bytes)] +
    //       [version (3 bytes)] +
    //       [additive (4 bytes)] +
    //       [next key (when magic is "M" or "C"), file hash (when magic is "E") (16 bytes)] +
    //       [payload (1000 bytes)] = 1024 bytes
    //   - key: Hash of value
    const packChunkBytes = (
        magic: "M" | "C" | "E",
        version: string,
        additive: string,
        nextKey: UInt64,
        chunkBytes: Uint8Array,
    ) => {
        // Append next scoped key into chunk's tail (except end of line)
        const value = new Uint8Array(chunkBytes.length + 8 + (nextKey ? 16 : 0));
        assert(value.length <= 1024);

        // Header (24 bytes)
        value.set(Convert.utf8ToUint8(magic.substring(0, 1)));
        value.set(Convert.utf8ToUint8(version.substring(0, 3)), 1);
        value.set(Convert.utf8ToUint8(additive.substring(0, 4)), 4);
        value.set(Convert.utf8ToUint8(nextKey.toHex()), 8);

        // Payload (max 1000 bytes)
        value.set(chunkBytes, HEADER_SIZE);

        // key's length will always be 16 bytes
        const key = generateMetadataKey(Convert.uint8ToUtf8(value));

        return { value, key };
    };

    // Returns:
    //   - key: Metadata key of first chunk (*undefined* when no transactions were created)
    //   - txs: List of metadata transaction (*InnerTransaction* for aggregate tx)
    //   - additive: Actual additive that been used during encoding. You should store this for verifying the metal.
    export const createForgeTxs = async (
        type: MetadataType,
        sourceAccount: PublicAccount,
        targetAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Buffer,
        additive: string = DEFAULT_ADDITIVE,
    ): Promise<{ key: UInt64, txs: InnerTransaction[], additive: string }> => {
        const payloadBase64Bytes = Convert.utf8ToUint8(payload.toString("base64"));
        const txs = new Array<InnerTransaction>();
        const keys = new Array<string>();

        const chunks = Math.ceil(payloadBase64Bytes.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey: UInt64 = generateHash(payload);
        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? "E" : i === 0 ? "M" : "C";
            const chunkBytes = payloadBase64Bytes.subarray(
                i * CHUNK_PAYLOAD_MAX_SIZE,
                (i + 1) * CHUNK_PAYLOAD_MAX_SIZE
            );
            const { value, key } = packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes);

            if (keys.includes(key.toHex())) {
                console.warn(`Warning: Scoped key "${key.toHex()}" has been conflicted. Trying another additive.`);
                // Retry with another additive via recursive call
                return createForgeTxs(
                    type,
                    sourceAccount,
                    targetAccount,
                    targetId,
                    payload,
                    generateRandomAdditive(),
                );
            }

            txs.push(await SymbolService.createMetadataTx(
                type,
                sourceAccount,
                targetAccount,
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
    };

    const createMetadataLookupTable = (metadataPool: Metadata[]) => {
        // Map key is hex string
        const lookupTable =  new Map<string, Metadata>();
        metadataPool.forEach(
            (metadata) => lookupTable.set(metadata.metadataEntry.scopedMetadataKey.toHex(), metadata)
        );
        return lookupTable;
    };

    // Return: Decoded base64 string.
    export const decodeAsBase64 = (key: UInt64, metadataPool: Metadata[]) => {
        const lookupTable = createMetadataLookupTable(metadataPool);

        let decodedBase64 = "";
        let currentKeyHex = key.toHex();
        let magic = "";
        do {
            const metadata = lookupTable.get(currentKeyHex)?.metadataEntry;
            if (!metadata) {
                console.error(`Error: The chunk ${currentKeyHex} lost`);
                break;
            }
            lookupTable.delete(currentKeyHex);  // Prevent loop

            magic = metadata.value.substring(0, 1);
            if (!["M", "C", "E"].includes(magic)) {
                console.error(`Error: Malformed header magic ${magic}`);
            }
            const version = metadata.value.substring(1, 4);
            if (version !== VERSION) {
                console.error(`Error: Malformed header version ${version}`);
                break;
            }

            const metadataValue = metadata.value;
            const checksumHex = generateMetadataKey(metadataValue).toHex();
            if (checksumHex !== currentKeyHex) {
                console.error(`Error: The chunk  ${currentKeyHex} is broken (received=${checksumHex})`);
                break;
            }

            currentKeyHex = metadataValue.substring(8, HEADER_SIZE);
            decodedBase64 += metadataValue.substring(HEADER_SIZE, HEADER_SIZE + CHUNK_PAYLOAD_MAX_SIZE);

        } while (magic !== "E");

        return decodedBase64;
    };

    // Calculate metadata key from payload. "additive" must be specified when using non-default one.
    export const calculateMetadataKey = (payload: Buffer, additive: string = DEFAULT_ADDITIVE) => {
        const payloadBase64Bytes = Convert.utf8ToUint8(payload.toString("base64"));

        const chunks = Math.ceil(payloadBase64Bytes.length / CHUNK_PAYLOAD_MAX_SIZE);
        let nextKey: UInt64 = generateHash(payload);
        for (let i = chunks - 1; i >= 0; i--) {
            const magic = i === chunks - 1 ? "E" : i === 0 ? "M" : "C";
            const chunkBytes = payloadBase64Bytes.subarray(i * CHUNK_PAYLOAD_MAX_SIZE, (i + 1) * CHUNK_PAYLOAD_MAX_SIZE);
            nextKey = packChunkBytes(magic, VERSION, additive, nextKey, chunkBytes).key;
        }

        return nextKey;
    };
    
    // Verify metadata key with calculated one. "additive" must be specified when using non-default one.
    export const verifyMetadataKey = (key: UInt64, payload: Buffer, additive: string = DEFAULT_ADDITIVE) =>
        calculateMetadataKey(payload, additive).equals(key);

    // Scrap metal via removing metadata
    export const createScrapTxs = async (
        type: MetadataType,
        sourceAccount: PublicAccount,
        targetAccount: PublicAccount,
        key: UInt64,
        targetId?: MosaicId | NamespaceId,
        metadataPool?: Metadata[],
    ) => {
        const lookupTable = createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await SymbolService.searchMetadata(type, {
                source: sourceAccount,
                target: targetAccount,
                targetId,
            })
        );

        const scrappedValueBytes = Convert.utf8ToUint8("");
        const txs = new Array<InnerTransaction>();
        let currentKeyHex = key.toHex();
        let magic = "";

        do {
            const metadata = lookupTable.get(currentKeyHex)?.metadataEntry;
            if (!metadata) {
                console.error(`Error: The chunk ${currentKeyHex} lost.`);
                return undefined;
            }
            lookupTable.delete(currentKeyHex);  // Prevent loop

            const value = metadata.value;
            magic = value.substring(0, 1);
            if (!["M", "C", "E"].includes(magic)) {
                console.error(`Error: Malformed header magic ${magic}`);
                break;
            }

            const valueBytes = Convert.utf8ToUint8(value);
            if (valueBytes.length === scrappedValueBytes.length &&
                valueBytes.toString() === scrappedValueBytes.toString()
            ) {
                console.error(`Error: The chunk ${currentKeyHex} is already scrapped`);
                break;
            }

            txs.push(await SymbolService.createMetadataTx(
                type,
                sourceAccount,
                targetAccount,
                targetId,
                metadata.scopedMetadataKey,
                Convert.hexToUint8(Convert.xor(valueBytes, scrappedValueBytes)),
                scrappedValueBytes.length - valueBytes.length,
            ));

            currentKeyHex = value.substring(8, HEADER_SIZE);
        } while (magic !== "E");

        return txs;
    };

    export const checkCollision = async (
        txs: InnerTransaction[],
        type: MetadataType,
        source: Account | PublicAccount | Address,
        target: Account | PublicAccount | Address,
        targetId?: MosaicId | NamespaceId,
        metadataPool?: Metadata[],
    ) => {
        const lookupTable = createMetadataLookupTable(
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await SymbolService.searchMetadata(type,  { source, target, targetId })
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
                    console.log(`${keyHex}: Already exists on the chain.`);
                    collisions.push(metadataTx.scopedMetadataKey);
                }
            }
        }

        return collisions;
    };

    export const verify = async (
        payload: Buffer,
        type: MetadataType,
        source: Account | PublicAccount | Address,
        target: Account | PublicAccount | Address,
        key: UInt64,
        targetId?: MosaicId | NamespaceId,
        metadataPool?: Metadata[],
    ) => {
        const payloadBase64 = payload.toString("base64");
        const decodedBase64 = decodeAsBase64(
            key,
            metadataPool ||
            // Retrieve scoped metadata from on-chain
            await SymbolService.searchMetadata(type,  { source, target, targetId })
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
    };

    export const getFirstChunk = async (metalId: string) =>
        SymbolService.getMetadataByHash(restoreMetadataHash(metalId));

    export const fetch = async (
        type: MetadataType,
        source: Address | Account | PublicAccount,
        target: Address | Account | PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        key: UInt64,
    ) => {
        const metadataPool = await SymbolService.searchMetadata(type, { source, target, targetId });
        return Buffer.from(decodeAsBase64(key, metadataPool), "base64");
    };
}