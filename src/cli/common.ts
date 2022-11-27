import {SymbolService} from "../services/symbol";
import {
    Account,
    Address,
    InnerTransaction,
    MetadataType,
    MosaicId,
    NamespaceId,
    PublicAccount,
    UInt64
} from "symbol-sdk";
import {toXYM} from "../libs/utils";
import Long from "long";
import moment from "moment";
import {MetalService} from "../services/metal";
import PromptSync from "prompt-sync";


const prompt = PromptSync();

export const isValueOption = (token?: string) => !token?.startsWith("-");

export const initCliEnv = async (nodeUrl: string, feeRatio: number) => {
    SymbolService.init({
        emit_mode: true,
        node_url: nodeUrl,
        fee_ratio: feeRatio,
        logging: false,
    });

    const { networkType } = await SymbolService.getNetwork();
    console.log(`Using node url: ${nodeUrl} (network type is ${networkType})`);
};

interface AccountsInput {
    signerPrivateKey?: string;
    sourcePublicKey?: string;
    sourcePrivateKey?: string;
    targetPublicKey?: string;
    targetPrivateKey?: string;
    signer?: Account;
    sourceAccount?: PublicAccount;
    sourceSigner?: Account;
    targetAccount?: PublicAccount;
    targetSigner?: Account;
}

export const validateAccountsInput = async <T extends AccountsInput>(
    input: T
) => {
    const { networkType } = await SymbolService.getNetwork();

    if (!input.signerPrivateKey) {
        input.signerPrivateKey = prompt("Signer Private Key? ");
        if (!input.signerPrivateKey) {
            throw Error(
                "Signer's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
            );
        }
    }
    input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);

    if (input.sourcePublicKey) {
        input.sourceAccount = PublicAccount.createFromPublicKey(input.sourcePublicKey, networkType);
    }

    if (input.sourcePrivateKey) {
        input.sourceSigner = Account.createFromPrivateKey(input.sourcePrivateKey, networkType);
        if (input.sourceAccount && !input.sourceSigner.publicAccount.equals(input.sourceAccount)) {
            throw Error("Mismatched source account between public key and private key (You don't need to specify public key)");
        }
    }

    if (input.targetPublicKey) {
        input.targetAccount = PublicAccount.createFromPublicKey(input.targetPublicKey, networkType);
    }

    if (input.targetPrivateKey) {
        input.targetSigner = Account.createFromPrivateKey(input.targetPrivateKey, networkType);
        if (input.targetAccount && !input.targetSigner.publicAccount.equals(input.targetAccount)) {
            throw Error("Mismatched target account between public key and private key (You don't need to specify public key)");
        }
    }

    return input;
};

export const buildAndExecuteBatches = async (
    txs: InnerTransaction[],
    signer: Account,
    cosigners: Account[],
    feeRatio: number,
    maxParallels: number,
    canAnnounce: boolean,
    usePrompt: boolean,
) => {
    const { networkProperties } = await SymbolService.getNetwork();
    const batchSize = Number(networkProperties.plugins.aggregate?.maxTransactionsPerAggregate || 100);

    const batches = await SymbolService.buildSignedAggregateCompleteTxBatches(
        txs,
        signer,
        cosigners,
        feeRatio,
        batchSize,
    );
    const totalFee = batches.reduce(
        (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
    );

    if (canAnnounce) {
        console.log(`Announcing ${batches.length} aggregate TXs with fee ${toXYM(Long.fromString(totalFee.toString()))} XYM total.`);
        if (usePrompt) {
            const decision = prompt("Are you sure announce these TXs [Y/n]? ", "Y");
            if (decision !== "Y" && decision !== "y") {
                throw new Error("Canceled by user.");
            }
        }

        const startAt = moment.now();
        const errors = await SymbolService.executeBatches(batches, signer, maxParallels);
        errors?.forEach(({txHash, error}) => {
            console.error(`${txHash}: ${error}`);
        });

        if (errors) {
            throw Error(`Error: Some errors occurred during announcing.`);
        } else {
            console.log(`Completed in ${moment().diff(startAt, "seconds", true)} secs.`);
        }
    }

    return {
        batches,
        totalFee,
    };
};

export const doVerify = async (
    payload: Buffer,
    type: MetadataType,
    source: Account | PublicAccount | Address,
    target: Account | PublicAccount | Address,
    key: UInt64,
    targetId?: MosaicId | NamespaceId,
) => {
    const { mismatches, maxLength } = await MetalService.verify(
        payload,
        type,
        source,
        target,
        key,
        targetId,
    );
    if (mismatches) {
        throw Error(`Verify error: Mismatch rate is ${mismatches / maxLength * 100}%`);
    } else {
        console.log(`Verify succeeded: No mismatches found.`);
    }
};
