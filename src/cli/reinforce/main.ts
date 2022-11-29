import {VERSION} from "./version";
import {ReinforceInput} from "./input";
import assert from "assert";
import fs from "fs";
import {IntermediateTxs, readIntermediateFile, writeIntermediateFile} from "../intermediate";
import {ReinforceOutput} from "./output";
import {SymbolService} from "../../services/symbol";
import {
    Convert,
    CosignatureSignedTransaction,
    CosignatureTransaction,
    MetadataType,
    MosaicId,
    NamespaceId,
    PublicAccount,
    SignedTransaction,
    TransactionType,
    UInt64
} from "symbol-sdk";
import {toXYM} from "../../libs/utils";
import moment from "moment/moment";
import {MetalService} from "../../services/metal";
import PromptSync from "prompt-sync";


const prompt = PromptSync();

const extractMetadataKeys = async (
    type: MetadataType,
    sourceAccount: PublicAccount,
    targetAccount: PublicAccount,
    targetId: undefined | MosaicId | NamespaceId,
    payload: Buffer,
    additive?: string
) => {
    const { txs } = await MetalService.createForgeTxs(
        type,
        sourceAccount,
        targetAccount,
        targetId,
        payload,
        additive,
    );
    return txs.map((tx) => (tx as SymbolService.MetadataTransaction).scopedMetadataKey.toHex());
};

const retrieveBatches = async (intermediateTxs: IntermediateTxs) => {
    const { networkType } = await SymbolService.getNetwork();
    const signerAccount = PublicAccount.createFromPublicKey(intermediateTxs.signerPublicKey, networkType);

    return intermediateTxs.txs.map((tx) => {
        const signedTx = new SignedTransaction(
            // Convert base64 to HEX
            Convert.uint8ToHex(Buffer.from(tx.payload, "base64")),
            tx.hash,
            signerAccount.publicKey,
            TransactionType.AGGREGATE_COMPLETE,
            networkType
        );

        const cosignatures = [ ...tx.cosignatures.map(
            (cosignature) => new CosignatureSignedTransaction(
                cosignature.parentHash,
                cosignature.signature,
                cosignature.signerPublicKey)
        ) ];

        return {
            signedTx,
            cosignatures,
            maxFee: UInt64.fromNumericString(tx.maxFee),
        };
    });
};

const reinforceMetal = async (
    intermediateTxs: IntermediateTxs,
    payload: Buffer,
    input: ReinforceInput.CommandlineInput,
): Promise<ReinforceOutput.CommandlineOutput> => {
    const { networkType } = await SymbolService.getNetwork();

    if (networkType !== intermediateTxs.networkType) {
        throw Error(`Wrong network type ${intermediateTxs.networkType}`);
    }

    const signers = [
        ...(input.signer ? [ input.signer ] : []),
        ...(input.cosigners || []),
    ];
    const signerAccount = PublicAccount.createFromPublicKey(intermediateTxs.signerPublicKey, networkType);
    const type = intermediateTxs.type;
    const sourceAccount = PublicAccount.createFromPublicKey(intermediateTxs.sourcePublicKey, networkType);
    const targetAccount = PublicAccount.createFromPublicKey(intermediateTxs.targetPublicKey, networkType);
    const targetId = type === MetadataType.Mosaic && intermediateTxs.mosaicId
        ? new MosaicId(intermediateTxs.mosaicId)
        : type === MetadataType.Namespace && intermediateTxs.namespaceId
            ? new NamespaceId(intermediateTxs.namespaceId)
            : undefined;

    // Construct reference txs and extract metadata keys.
    let metadataKeys = await extractMetadataKeys(
        type,
        sourceAccount,
        targetAccount,
        targetId,
        payload,
        intermediateTxs.additive
    );

    // Retrieve signed txs that can cosign and announce
    const batches = await retrieveBatches(intermediateTxs);

    // Validate transactions that was contained intermediate JSON.
    console.log(`Validating intermediate TXs of ${intermediateTxs.metalId}`);
    for (const batch of batches) {
        if (!MetalService.validateBatch(
            batch,
            type,
            sourceAccount.address,
            targetAccount.address,
            targetId,
            signerAccount.address,
            metadataKeys,
        )) {
            throw Error(`Intermediate TXs validation failed.`);
        }
    }

    // Add cosignatures of new cosigners
    batches.forEach((batch) => {
        signers.forEach((signer) => {
            batch.cosignatures.push(CosignatureTransaction.signTransactionHash(signer, batch.signedTx.hash));
        });
    });

    if (input.announce && !input.outputPath) {
        console.log(
            `Announcing ${batches.length} aggregate TXs. ` +
            `TX fee ${toXYM(intermediateTxs.totalFee)} XYM will be paid by forge originator.`
        );
        if (!input.force) {
            const decision = prompt("Are you sure announce these TXs [(y)/n]? ", "Y");
            if (decision !== "Y" && decision !== "y") {
                throw new Error("Canceled by user.");
            }
        }

        const startAt = moment.now();
        const errors = await SymbolService.executeBatches(batches, signerAccount, input.maxParallels);
        errors?.forEach(({txHash, error}) => {
            console.error(`${txHash}: ${error}`);
        });

        if (errors) {
            throw Error(`Some errors occurred during announcing.`);
        } else {
            console.log(`Completed in ${moment().diff(startAt, "seconds", true)} secs.`);
        }
    }

    return {
        networkType,
        batches,
        key: intermediateTxs.key !== undefined ? UInt64.fromHex(intermediateTxs.key) : undefined,
        totalFee: UInt64.fromNumericString(intermediateTxs.totalFee),
        additive: intermediateTxs.additive,
        sourceAccount: sourceAccount,
        targetAccount: targetAccount,
        ...(intermediateTxs.mosaicId ? { mosaicId: new MosaicId(intermediateTxs.mosaicId) } : {}),
        ...(intermediateTxs.namespaceId ? { namespaceId: new NamespaceId(intermediateTxs.namespaceId) } : {}),
        status: input.announce ? "reinforced" : "estimated",
        metalId: intermediateTxs.metalId,
        signerAccount,
        command: intermediateTxs.command,
        type,
        createdAt: new Date(intermediateTxs.createdAt),
    };
};

export const main = async (argv: string[]) => {
    console.log(`Reinforce Metal CLI version ${VERSION}\n`);

    let input: ReinforceInput.CommandlineInput;
    try {
        input = await ReinforceInput.validateInput(ReinforceInput.parseInput(argv));
    } catch (e) {
        ReinforceInput.printUsage();
        if (e === "help") {
            return;
        }
        throw e;
    }

    // Read intermediate JSON contents here.
    assert(input.intermediatePath);
    const intermediateTxs = readIntermediateFile(input.intermediatePath);

    // Read input file here.
    assert(input.filePath);
    console.log(`${input.filePath}: Reading...`);
    const payload = fs.readFileSync(input.filePath);
    if (!payload.length) {
        throw Error(`${input.filePath}: The file is empty.`);
    }

    const output = await reinforceMetal(intermediateTxs, payload, input);
    if (input.outputPath) {
        writeIntermediateFile(output, input.outputPath);
    }
    ReinforceOutput.printOutputSummary(output);
};

main(process.argv.slice(2))
    .catch((e) => {
        console.error(e.toString());
        process.exit(1);
    });
