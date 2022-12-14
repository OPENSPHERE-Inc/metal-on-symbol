import {Convert, MetadataType} from "symbol-sdk";
import assert from "assert";
import {ForgeInput} from "./input";
import {ForgeOutput} from "./output";
import {MetalService} from "../../services";
import {
    buildAndExecuteBatches,
    buildAndExecuteUndeadBatches, deadlineMinHours,
    designateCosigners,
    doVerify,
    metalService,
    symbolService
} from "../common";
import {writeIntermediateFile} from "../intermediate";
import {Logger} from "../../libs";
import {readStreamInput} from "../stream";


export namespace ForgeCLI {

    const forgeMetal = async (
        input: Readonly<ForgeInput.CommandlineInput>,
        payload: Uint8Array,
    ): Promise<ForgeOutput.CommandlineOutput> => {
        const { networkType } = await symbolService.getNetwork();
        assert(input.signerAccount);

        const targetId = [ undefined, input.mosaicId, input.namespaceId ][input.type];
        const signerPubAccount = input.signerAccount.publicAccount;
        const sourcePubAccount = input.sourcePubAccount || input.sourceSignerAccount?.publicAccount || signerPubAccount;
        const targetPubAccount = input.targetPubAccount || input.targetSignerAccount?.publicAccount || signerPubAccount;
        const metadataPool = input.recover
            ? await symbolService.searchMetadata(input.type, {
                source: sourcePubAccount,
                target: targetPubAccount,
                targetId
            })
            : undefined;

        const { key, txs, additive: additiveBytes } = await metalService.createForgeTxs(
            input.type,
            sourcePubAccount,
            targetPubAccount,
            targetId,
            payload,
            input.additiveBytes,
            metadataPool,
        );
        if (!txs.length) {
            throw new Error("There is nothing to forge.")
        }

        const metalId = MetalService.calculateMetalId(
            input.type,
            sourcePubAccount.address,
            targetPubAccount.address,
            targetId,
            key,
        );
        Logger.debug(`Computed Metal ID is ${metalId}`);

        if (input.checkCollision && !input.recover) {
            // Check collision (Don't on recover mode)
            const collisions = await metalService.checkCollision(
                txs,
                input.type,
                sourcePubAccount,
                targetPubAccount,
                targetId,
            );
            if (collisions.length) {
                throw new Error(`${key?.toHex()}: Already exists on the target ${
                    ["account", "mosaic", "namespace"][input.type]
                }`);
            }
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
                !input.force && !input.stdin,
            )
            : await buildAndExecuteBatches(
                txs,
                input.signerAccount,
                designatedCosignerAccounts,
                input.feeRatio,
                input.requiredCosignatures || designatedCosignerAccounts.length,
                input.maxParallels,
                canAnnounce,
                !input.force && !input.stdin,
            );

        if (input.verify && key && canAnnounce) {
            await doVerify(
                payload,
                input.type,
                sourcePubAccount.address,
                targetPubAccount.address,
                key,
                targetId
            );
        }

        return {
            command: "forge",
            networkType,
            batches,
            undeadBatches,
            key,
            totalFee,
            additive: Convert.uint8ToUtf8(additiveBytes),
            sourcePubAccount,
            targetPubAccount,
            ...(input.type === MetadataType.Mosaic ? { mosaicId: input.mosaicId } : {}),
            ...(input.type === MetadataType.Namespace ? { namespaceId: input.namespaceId } : {}),
            status: canAnnounce ? "forged" : "estimated",
            metalId,
            signerPubAccount,
            type: input.type,
            createdAt: new Date(),
            payload,
        };
    };

    export const main = async (argv: string[]) => {
        let input: ForgeInput.CommandlineInput;
        try {
            input = await ForgeInput.validateInput(ForgeInput.parseInput(argv));
        } catch (e) {
            ForgeInput.printVersion();
            if (e === "version") {
                return;
            }
            ForgeInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        // Read input file contents here.
        const payload = await readStreamInput(input);

        const output = await forgeMetal(input, payload);
        if (input.outputPath) {
            writeIntermediateFile(output, input.outputPath);
        }
        ForgeOutput.printOutputSummary(output);

        return output;
    };

}





