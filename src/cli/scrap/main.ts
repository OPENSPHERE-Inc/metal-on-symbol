import assert from "assert";
import fs from "fs";
import mime from "mime";
import path from "path";
import { MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { Logger } from "../../libs";
import { MetalSeal, MetalServiceV2 } from "../../services";
import {
    buildAndExecuteBatches,
    buildAndExecuteUndeadBatches,
    deadlineMinHours,
    designateCosigners,
    metalService,
    symbolService
} from "../common";
import { writeIntermediateFile } from "../intermediate";
import { ScrapInput } from "./input";
import { ScrapOutput } from "./output";


export namespace ScrapCLI {

    const scrapMetal = async (
        input: Readonly<ScrapInput.CommandlineInput>,
        payload?: Uint8Array,
    ): Promise<ScrapOutput.CommandlineOutput> => {
        const { networkType } = await symbolService.getNetwork();
        assert(input.signerAccount);

        const signerPubAccount = input.signerAccount.publicAccount;
        let sourcePubAccount = input.sourcePubAccount || input.sourceSignerAccount?.publicAccount || signerPubAccount;
        let targetPubAccount = input.targetPubAccount || input.targetSignerAccount?.publicAccount || signerPubAccount;
        let type = input.type;
        let key = input.key;
        let metalId = input.metalId;
        let targetId: undefined | MosaicId | NamespaceId;
        let additive = input.additive;

        const createMetalSealText = (payload: Uint8Array) => new MetalSeal(
            payload.length,
            (input.filePath && mime.getType(input.filePath)) ?? undefined,
            input.filePath && path.basename(input.filePath),
        ).stringify();

        if (metalId) {
            const metadataEntry = (await metalService.getFirstChunk(metalId)).metadataEntry;
            // Obtain type, key and targetId here.
            type = metadataEntry.metadataType
            key = metadataEntry.scopedMetadataKey;
            targetId = metadataEntry.targetId;
            const chunkData = MetalServiceV2.extractChunk(metadataEntry);
            if (!chunkData) {
                throw new Error(`The chunk is broken.`);
            } else if (chunkData.version !== 0x31) {
                throw new Error("Version 1 Metal cannot be scrap. Please use 'scrap-v1' CLI instead.")
            }
            additive = chunkData.additive;

            // We cannot retrieve publicKey at this time. Only can do address check.
            if (!sourcePubAccount.address.equals(metadataEntry?.sourceAddress)) {
                throw new Error(`Source address mismatched.`);
            }
            if (!targetPubAccount.address.equals(metadataEntry?.targetAddress)) {
                throw new Error(`Target address mismatched.`);
            }
        } else {
            if (!key && payload) {
                // Obtain metadata key here
                key = MetalServiceV2.calculateMetadataKey(payload, input.additive, createMetalSealText(payload));
            }

            assert(type !== undefined);
            assert(key);

            // Obtain targetId and metalId here
            targetId = [ undefined, input.mosaicId, input.namespaceId ][type];
            metalId = MetalServiceV2.calculateMetalId(
                type,
                sourcePubAccount.address,
                targetPubAccount.address,
                targetId,
                key,
            );
        }

        Logger.debug(`Scanning on-chain chunks of the metal ${metalId}`);
        const txs = (payload)
            ? await metalService.createDestroyTxs(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                payload,
                additive,
                createMetalSealText(payload),
            )
            : await metalService.createScrapTxs(
                type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
                key,
            );
        if (!txs?.length) {
            throw new Error(`There is nothing to scrap.`);
        }

        const { designatedCosignerAccounts, hasEnoughCosigners } = designateCosigners(
            signerPubAccount,
            sourcePubAccount,
            targetPubAccount,
            input.sourceSignerAccount,
            input.targetSignerAccount,
            input.cosignerAccounts,
        );
        const canAnnounce = hasEnoughCosigners && !input.estimate;

        const { batches, undeadBatches, totalFee } = input.deadlineHours > deadlineMinHours
            ? await buildAndExecuteUndeadBatches(
                txs,
                input.signerAccount,
                designatedCosignerAccounts,
                input.feeRatio,
                input.requiredCosignatures || designatedCosignerAccounts.length,
                input.deadlineHours,
                input.maxParallels,
                canAnnounce,
                !input.force,
            )
            : await buildAndExecuteBatches(
                txs,
                input.signerAccount,
                designatedCosignerAccounts,
                input.feeRatio,
                input.requiredCosignatures || designatedCosignerAccounts.length,
                input.maxParallels,
                canAnnounce,
                !input.force,
            );

        return {
            command: "scrap",
            networkType,
            batches,
            undeadBatches,
            key,
            totalFee,
            sourcePubAccount,
            targetPubAccount,
            ...(type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
            ...(type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
            status: canAnnounce ? "scrapped" : "estimated",
            metalId,
            signerPubAccount,
            additive: additive || MetalServiceV2.DEFAULT_ADDITIVE,
            type,
            createdAt: new Date(),
        };
    };

    export const main = async (argv: string[]) => {
        let input: ScrapInput.CommandlineInput;
        try {
            input = await ScrapInput.validateInput(ScrapInput.parseInput(argv));
        } catch (e) {
            ScrapInput.printVersion();
            if (e === "version") {
                return;
            }
            ScrapInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        let payload: Uint8Array | undefined;
        if (input.filePath) {
            // Read input file contents here.
            Logger.debug(`${input.filePath}: Reading...`);
            payload = fs.readFileSync(input.filePath);
            if (!payload.length) {
                throw new Error(`${input.filePath}: The file is empty.`);
            }
        }

        const output = await scrapMetal(input, payload);
        if (input.outputPath) {
            writeIntermediateFile(output, input.outputPath);
        }
        ScrapOutput.printOutputSummary(output);

        return output;
    };

}

