import assert from "assert";
import fs from "fs";
import { Convert, MetadataType, MosaicId, NamespaceId } from "symbol-sdk";
import { Logger } from "../../../libs";
import { MetalService } from "../../../services/compat";
import {
    buildAndExecuteBatches,
    buildAndExecuteUndeadBatches,
    deadlineMinHours,
    designateCosigners,
    metalService,
    symbolService
} from "../common";
import { writeIntermediateFile } from "../intermediate";
import { ScrapInputV1 } from "./input";
import { ScrapOutputV1 } from "./output";


export namespace ScrapCLIV1 {

    const scrapMetal = async (
        input: Readonly<ScrapInputV1.CommandlineInput>,
        payload?: Uint8Array,
    ): Promise<ScrapOutputV1.CommandlineOutput> => {
        const { networkType } = await symbolService.getNetwork();
        assert(input.signerAccount);

        const signerPubAccount = input.signerAccount.publicAccount;
        let sourcePubAccount = input.sourcePubAccount || input.sourceSignerAccount?.publicAccount || signerPubAccount;
        let targetPubAccount = input.targetPubAccount || input.targetSignerAccount?.publicAccount || signerPubAccount;
        let type = input.type;
        let key = input.key;
        let metalId = input.metalId;
        let targetId: undefined | MosaicId | NamespaceId;
        let additiveBytes = input.additiveBytes;

        if (metalId) {
            const metadataEntry = (await metalService.getFirstChunk(metalId)).metadataEntry;
            // Obtain type, key and targetId here.
            type = metadataEntry.metadataType
            key = metadataEntry.scopedMetadataKey;
            targetId = metadataEntry.targetId;
            additiveBytes = MetalService.extractChunk(metadataEntry)?.additive;
            if (!additiveBytes) {
                throw new Error(`The chunk is broken.`);
            }

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
                key = MetalService.calculateMetadataKey(payload, input.additiveBytes);
            }

            assert(type !== undefined);
            assert(key);

            // Obtain targetId and metalId here
            targetId = [ undefined, input.mosaicId, input.namespaceId ][type];
            metalId = MetalService.calculateMetalId(
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
                additiveBytes,
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
            additive: Convert.uint8ToUtf8(additiveBytes || MetalService.DEFAULT_ADDITIVE),
            type,
            createdAt: new Date(),
        };
    };

    export const main = async (argv: string[]) => {
        let input: ScrapInputV1.CommandlineInput;
        try {
            input = await ScrapInputV1.validateInput(ScrapInputV1.parseInput(argv));
        } catch (e) {
            ScrapInputV1.printVersion();
            if (e === "version") {
                return;
            }
            ScrapInputV1.printUsage();
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
        ScrapOutputV1.printOutputSummary(output);

        return output;
    };

}

