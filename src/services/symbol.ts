import { BinMetadata, BinMetadataEntry } from "@opensphere-inc/symbol-service";
import { Convert, Metadata, MetadataEntry } from "symbol-sdk";
export {
    SymbolService,
    SignedAggregateTx,
    MetadataTransaction,
    SymbolTest,
    SymbolServiceConfig,
    BinMetadata,
    BinMetadataEntry,
    BinMetadataHttp,
    BinMetadataRepository,
    BinMetadataPaginationStreamer,
    AggregateUndeadTransaction,
    UndeadSignature,
    NecromancyService
} from "@opensphere-inc/symbol-service";


export const metadataEntryConverter = {
    toBin: (metadataEntry: MetadataEntry) => {
        return new BinMetadataEntry(
            metadataEntry.version,
            metadataEntry.compositeHash,
            metadataEntry.sourceAddress,
            metadataEntry.targetAddress,
            metadataEntry.scopedMetadataKey,
            metadataEntry.metadataType,
            Convert.utf8ToUint8(metadataEntry.value),
            metadataEntry.targetId
        );
    },

    fromBin: (binMetadataEntry: BinMetadataEntry) => {
        return new MetadataEntry(
            binMetadataEntry.version,
            binMetadataEntry.compositeHash,
            binMetadataEntry.sourceAddress,
            binMetadataEntry.targetAddress,
            binMetadataEntry.scopedMetadataKey,
            binMetadataEntry.metadataType,
            Convert.uint8ToUtf8(binMetadataEntry.value),
            binMetadataEntry.targetId
        );
    }
};

export const metadataConverter = {
    toBin: (metadata: Metadata) => {
        return new BinMetadata(
            metadata.id,
            metadataEntryConverter.toBin(metadata.metadataEntry),
        );
    },

    fromBin: (binMetadata: BinMetadata) => {
        return new Metadata(
            binMetadata.id,
            metadataEntryConverter.fromBin(binMetadata.metadataEntry),
        );
    }
};
