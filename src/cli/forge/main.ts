import {MetadataType} from "symbol-sdk";
import fs from "fs";
import assert from "assert";
import {CommandlineInput, parseInput, printUsage, validateInput} from "./input";
import {CommandlineOutput, printOutputSummary, writeOutputFile} from "./output";
import {VERSION} from "./version";
import {SymbolService} from "../../services/symbol";
import {MetalService} from "../../services/metal";
import {buildAndExecuteBatches, doVerify} from "../common";


export const forgeMetal = async (
    payload: Buffer,
    input: CommandlineInput,
): Promise<CommandlineOutput> => {
    const { networkType } = await SymbolService.getNetwork();
    assert(input.signer);

    const targetId = [ undefined, input.mosaicId, input.namespaceId ][input.type];
    const signerAccount = input.signer.publicAccount;
    const sourceAccount = input.sourceAccount || input.sourceSigner?.publicAccount || signerAccount;
    const targetAccount = input.targetAccount || input.targetSigner?.publicAccount || signerAccount;

    const { key, txs, additive } = await MetalService.createForgeTxs(
        input.type,
        sourceAccount,
        targetAccount,
        targetId,
        payload,
        input.additive
    );

    const metalId = MetalService.calculateMetalId(
        input.type,
        sourceAccount.address,
        targetAccount.address,
        key,
        targetId
    );
    console.log(`Computed Metal ID is ${metalId}`);

    if (input.checkCollision) {
        // Check collision
        const collisions = await MetalService.checkCollision(
            txs,
            input.type,
            sourceAccount,
            targetAccount,
            targetId,
        );
        if (collisions.length) {
            throw Error(`${key?.toHex()}: Already exists on the target ${["account", "mosaic", "namespace"][input.type]}`);
        }
    }

    // Not estimate mode. Cosigns are unnecessary: Announce TXs
    const canAnnounce = !input.estimate && (
        signerAccount.equals(sourceAccount) || !!input.sourceSigner
    ) && (
        signerAccount.equals(targetAccount) || !!input.targetSigner
    );
    const { batches, totalFee } = await buildAndExecuteBatches(
        txs,
        input.signer,
        [
            ...(!signerAccount.equals(sourceAccount) && input.sourceSigner ? [ input.sourceSigner ] : []),
            ...(!signerAccount.equals(targetAccount) && input.targetSigner ? [ input.targetSigner ] : []),
        ],
        input.feeRatio,
        input.maxParallels,
        canAnnounce,
        !input.force,
    );

    if (key && input.verify) {
        await doVerify(
            payload,
            input.type,
            sourceAccount,
            targetAccount,
            key,
            targetId
        );
    }

    return {
        networkType,
        batches,
        key,
        totalFee,
        additive,
        sourceAccount,
        targetAccount,
        ...(input.type === MetadataType.Mosaic ? { mosaicId: input.mosaicId } : {}),
        ...(input.type === MetadataType.Namespace ? { namespaceId: input.namespaceId } : {}),
        status: canAnnounce ? "forged" : "estimated",
        metalId,
    };
};

const main = async () => {
    console.log(`Forge Metal CLI version ${VERSION}`);

    let input: CommandlineInput;
    try {
        input = await validateInput(parseInput());
    } catch (e) {
        printUsage();
        if (e === "help") {
            return;
        }
        throw e;
    }

    // Read input file contents here.
    assert(input.filePath);
    console.log(`${input.filePath}: Reading...`);
    const payload = fs.readFileSync(input.filePath);
    if (!payload.length) {
        throw Error(`${input.filePath}: The file is empty.`);
    }

    const output = await forgeMetal(payload, input);

    if (input.outputPath) {
        writeOutputFile(output, input.outputPath);
    }

    printOutputSummary(output);
};

main()
    .catch((e) => {
        console.error(e.toString());
        process.exit(1);
    });




