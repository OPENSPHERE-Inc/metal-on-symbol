import {ReinforceInput} from "./input";
import assert from "assert";
import {IntermediateTxs, readIntermediateFile, writeIntermediateFile} from "../intermediate";
import {ReinforceOutput} from "./output";
import {SymbolService} from "../../services";
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
import {Utils} from "../../libs";
import moment from "moment/moment";
import {MetalService} from "../../services";
import { Base64 } from "js-base64";
import {Logger} from "../../libs";
import {readStreamInput} from "../stream";
import prompts from "prompts";


export namespace ReinforceCLI {

    const extractMetadataKeys = async (
        type: MetadataType,
        sourceAccount: PublicAccount,
        targetAccount: PublicAccount,
        targetId: undefined | MosaicId | NamespaceId,
        payload: Uint8Array,
        additive?: string
    ) => {
        const additiveBytes = additive ? Convert.utf8ToUint8(additive) : undefined;
        const { txs } = await MetalService.createForgeTxs(
            type,
            sourceAccount,
            targetAccount,
            targetId,
            payload,
            additiveBytes,
        );
        return txs.map((tx) => (tx as SymbolService.MetadataTransaction).scopedMetadataKey.toHex());
    };

    const retrieveBatches = async (intermediateTxs: IntermediateTxs) => {
        const { networkType } = await SymbolService.getNetwork();
        const signerAccount = PublicAccount.createFromPublicKey(intermediateTxs.signerPublicKey, networkType);

        return intermediateTxs.txs.map((tx) => {
            const signedTx = new SignedTransaction(
                // Convert base64 to HEX
                Convert.uint8ToHex(Base64.toUint8Array(tx.payload)),
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
        input: Readonly<ReinforceInput.CommandlineInput>,
        intermediateTxs: IntermediateTxs,
        payload: Uint8Array,
    ): Promise<ReinforceOutput.CommandlineOutput> => {
        const { networkType } = await SymbolService.getNetwork();

        if (networkType !== intermediateTxs.networkType) {
            throw new Error(`Wrong network type ${intermediateTxs.networkType}`);
        }

        const cosigners = [
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
                ? SymbolService.createNamespaceId(intermediateTxs.namespaceId)
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
        Logger.debug(`Validating intermediate TXs of ${intermediateTxs.metalId}`);
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
                throw new Error(`Intermediate TXs validation failed.`);
            }
        }

        // Add cosignatures of new cosigners
        batches.forEach((batch) => {
            batch.cosignatures.push(
                ...cosigners.map(
                    (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, batch.signedTx.hash)
                )
            );
        });

        if (input.announce) {
            Logger.info(
                `Announcing ${batches.length} aggregate TXs. ` +
                `TX fee ${Utils.toXYM(intermediateTxs.totalFee)} XYM will be paid by ${intermediateTxs.command} originator.`
            );
            if (!input.force && !input.stdin) {
                const decision = (await prompts({
                    type: "confirm",
                    name: "decision",
                    initial: true,
                    message: "Are you sure announce these TXs?",
                    stdout: process.stderr,
                })).decision;
                if (!decision) {
                    throw new Error("Canceled by user.");
                }
            }

            const startAt = moment.now();
            const errors = await SymbolService.executeBatches(batches, signerAccount, input.maxParallels);
            errors?.forEach(({txHash, error}) => {
                Logger.error(`${txHash}: ${error}`);
            });

            if (errors) {
                throw new Error(`Some errors occurred during announcing.`);
            } else {
                Logger.info(`Completed in ${moment().diff(startAt, "seconds", true)} secs.`);
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
            payload,
        };
    };

    export const main = async (argv: string[]) => {
        let input: ReinforceInput.CommandlineInput;
        try {
            input = await ReinforceInput.validateInput(ReinforceInput.parseInput(argv));
        } catch (e) {
            ReinforceInput.printVersion();
            if (e === "version") {
                return;
            }
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
        const payload = await readStreamInput(input);

        const output = await reinforceMetal(input, intermediateTxs, payload);
        if (input.outputPath) {
            writeIntermediateFile(output, input.outputPath);
        }
        ReinforceOutput.printOutputSummary(output);

        return output;
    };

}

