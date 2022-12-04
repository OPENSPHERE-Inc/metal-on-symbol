import {ScrapInput} from "./input";
import assert from "assert";
import fs from "fs";
import {Convert, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {ScrapOutput} from "./output";
import {MetalService} from "../../services";
import {VERSION} from "./version";
import {SymbolService} from "../../services";
import {buildAndExecuteBatches, designateCosigners} from "../common";
import {writeIntermediateFile} from "../intermediate";
import {PACKAGE_VERSION} from "../../package_version";


export namespace ScrapCLI {

    const scrapMetal = async (
        input: ScrapInput.CommandlineInput,
        payload?: Uint8Array,
    ): Promise<ScrapOutput.CommandlineOutput> => {
        const { networkType } = await SymbolService.getNetwork();
        assert(input.signer);

        const signerAccount = input.signer.publicAccount;
        let sourceAccount = input.sourceAccount || input.sourceSigner?.publicAccount || signerAccount;
        let targetAccount = input.targetAccount || input.targetSigner?.publicAccount || signerAccount;
        let type = input.type;
        let key = input.key;
        let metalId = input.metalId;
        let targetId: undefined | MosaicId | NamespaceId;
        let additiveBytes = input.additiveBytes;

        if (metalId) {
            const metadataEntry = (await MetalService.getFirstChunk(metalId)).metadataEntry;
            // Obtain type, key and targetId here.
            type = metadataEntry.metadataType
            key = metadataEntry.scopedMetadataKey;
            targetId = metadataEntry.targetId;
            additiveBytes = MetalService.extractChunk(metadataEntry)?.additive;
            if (!additiveBytes) {
                throw new Error(`The chunk is broken.`);
            }

            // We cannot retrieve publicKey at this time. Only can do address check.
            if (!sourceAccount.address.equals(metadataEntry?.sourceAddress)) {
                throw new Error(`Source address mismatched.`);
            }
            if (!targetAccount.address.equals(metadataEntry?.targetAddress)) {
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
                sourceAccount.address,
                targetAccount.address,
                targetId,
                key,
            );
        }

        console.log(`Scanning on-chain chunks of the metal ${metalId}`);
        const txs = (payload)
            ? await MetalService.createDestroyTxs(
                type,
                sourceAccount,
                targetAccount,
                targetId,
                payload,
                additiveBytes,
            )
            : await MetalService.createScrapTxs(
                type,
                sourceAccount,
                targetAccount,
                targetId,
                key,
            );
        if (!txs) {
            throw new Error(`Scrap metal TXs creation failed.`);
        }

        const { designatedCosigners, hasEnoughCosigners } = designateCosigners(
            signerAccount,
            sourceAccount,
            targetAccount,
            input.sourceSigner,
            input.targetSigner,
            input.cosigners,
        );
        const canAnnounce = hasEnoughCosigners && !input.estimate;

        const { batches, totalFee } = txs.length
            ? await buildAndExecuteBatches(
                txs,
                input.signer,
                designatedCosigners,
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
            sourceAccount: sourceAccount,
            targetAccount: targetAccount,
            ...(type === MetadataType.Mosaic ? { mosaicId: targetId as MosaicId } : {}),
            ...(type === MetadataType.Namespace ? { namespaceId: targetId as NamespaceId } : {}),
            status: canAnnounce ? "scrapped" : "estimated",
            metalId,
            signerAccount,
            additive: Convert.uint8ToUtf8(additiveBytes || MetalService.DEFAULT_ADDITIVE),
            type,
            createdAt: new Date(),
        };
    };

    export const main = async (argv: string[]) => {
        console.log(`Metal Scrap CLI version ${VERSION} (${PACKAGE_VERSION})\n`);

        let input: ScrapInput.CommandlineInput;
        try {
            input = await ScrapInput.validateInput(ScrapInput.parseInput(argv));
        } catch (e) {
            ScrapInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        let payload: Uint8Array | undefined;
        if (input.filePath) {
            // Read input file contents here.
            console.log(`${input.filePath}: Reading...`);
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

