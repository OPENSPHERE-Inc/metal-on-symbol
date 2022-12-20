import {ScrapInput} from "./input";
import assert from "assert";
import fs from "fs";
import {Convert, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {ScrapOutput} from "./output";
import {MetalService} from "../../services";
import {buildAndExecuteBatches, designateCosigners, metalService, symbolService} from "../common";
import {writeIntermediateFile} from "../intermediate";
import {Logger} from "../../libs";


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
        if (!txs) {
            throw new Error(`Scrap metal TXs creation failed.`);
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

        const { batches, totalFee } = txs.length
            ? await buildAndExecuteBatches(
                txs,
                input.signerAccount,
                designatedCosignerAccounts,
                input.feeRatio,
                input.maxParallels,
                canAnnounce,
                !input.force,
            )
            : { batches: [], totalFee: UInt64.fromUint(0) };

        return {
            command: "scrap",
            networkType,
            batches,
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

