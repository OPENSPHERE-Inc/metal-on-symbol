import {Convert, MetadataType, UInt64} from "symbol-sdk";
import assert from "assert";
import {ForgeInput} from "./input";
import {ForgeOutput} from "./output";
import {VERSION} from "./version";
import {SymbolService} from "../../services";
import {MetalService} from "../../services";
import {buildAndExecuteBatches, designateCosigners, doVerify} from "../common";
import {writeIntermediateFile} from "../intermediate";
import {PACKAGE_VERSION} from "../../package_version";
import {Logger} from "../../libs";
import {readStreamInput} from "../stream";


export namespace ForgeCLI {

    const forgeMetal = async (
        input: Readonly<ForgeInput.CommandlineInput>,
        payload: Uint8Array,
    ): Promise<ForgeOutput.CommandlineOutput> => {
        const { networkType } = await SymbolService.getNetwork();
        assert(input.signer);

        const targetId = [ undefined, input.mosaicId, input.namespaceId ][input.type];
        const signerAccount = input.signer.publicAccount;
        const sourceAccount = input.sourceAccount || input.sourceSigner?.publicAccount || signerAccount;
        const targetAccount = input.targetAccount || input.targetSigner?.publicAccount || signerAccount;
        const metadataPool = input.recover
            ? await SymbolService.searchMetadata(input.type, {
                source: sourceAccount,
                target: targetAccount,
                targetId
            })
            : undefined;

        const { key, txs, additive: additiveBytes } = await MetalService.createForgeTxs(
            input.type,
            sourceAccount,
            targetAccount,
            targetId,
            payload,
            input.additiveBytes,
            metadataPool,
        );

        const metalId = MetalService.calculateMetalId(
            input.type,
            sourceAccount.address,
            targetAccount.address,
            targetId,
            key,
        );
        Logger.log(`Computed Metal ID is ${metalId}`);

        if (input.checkCollision && !input.recover) {
            // Check collision (Don't on recover mode)
            const collisions = await MetalService.checkCollision(
                txs,
                input.type,
                sourceAccount,
                targetAccount,
                targetId,
            );
            if (collisions.length) {
                throw new Error(`${key?.toHex()}: Already exists on the target ${
                    ["account", "mosaic", "namespace"][input.type]
                }`);
            }
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

        if (input.verify && key && canAnnounce) {
            await doVerify(
                payload,
                input.type,
                sourceAccount.address,
                targetAccount.address,
                key,
                targetId
            );
        }

        return {
            command: "forge",
            networkType,
            batches,
            key,
            totalFee,
            additive: Convert.uint8ToUtf8(additiveBytes),
            sourceAccount: sourceAccount,
            targetAccount: targetAccount,
            ...(input.type === MetadataType.Mosaic ? { mosaicId: input.mosaicId } : {}),
            ...(input.type === MetadataType.Namespace ? { namespaceId: input.namespaceId } : {}),
            status: canAnnounce ? "forged" : "estimated",
            metalId,
            signerAccount,
            type: input.type,
            createdAt: new Date(),
            payload,
        };
    };

    export const main = async (argv: string[]) => {
        Logger.log(`Metal Forge CLI version ${VERSION} (${PACKAGE_VERSION})\n`);

        let input: ForgeInput.CommandlineInput;
        try {
            input = await ForgeInput.validateInput(ForgeInput.parseInput(argv));
        } catch (e) {
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





