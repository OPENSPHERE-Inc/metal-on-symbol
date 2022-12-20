import {MetalService, SymbolService} from "../services";
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
import {Logger} from "../libs";
import Long from "long";
import moment from "moment";
import prompts from "prompts";


export const isValueOption = (token?: string) => !token?.startsWith("-");
export let symbolService: SymbolService;
export let metalService: MetalService;

export interface NodeInput {
    nodeUrl?: string;
}

export const initCliEnv = async <T extends NodeInput>(input: Readonly<T>, feeRatio: number) => {
    if (!input.nodeUrl) {
        throw new Error("Node URL wasn't specified. [--node-url value] or NODE_URL is required.");
    }

    symbolService = new SymbolService({
        node_url: input.nodeUrl,
        fee_ratio: feeRatio,
        deadline_hours: 5,
    });

    const { networkType } = await symbolService.getNetwork();
    Logger.debug(`Using Node URL: ${input.nodeUrl} (network_type:${networkType})`);

    metalService = new MetalService(symbolService);
};

export const designateCosigners = (
    signerPubAccount: PublicAccount,
    sourcePubAccount: PublicAccount,
    targetPubAccount: PublicAccount,
    sourceSignerAccount?: Account,
    targetSignerAccount?: Account,
    cosignerAccounts?: Account[]
) => {
    const designatedCosignerAccounts = new Array<Account>(...(cosignerAccounts || []));
    if (!signerPubAccount.equals(sourcePubAccount) && sourceSignerAccount) {
        designatedCosignerAccounts.push(sourceSignerAccount);
    }
    if (!signerPubAccount.equals(targetPubAccount) && targetSignerAccount) {
        designatedCosignerAccounts.push(targetSignerAccount);
    }

    const hasEnoughCosigners = (
        signerPubAccount.equals(sourcePubAccount) ||
        !!sourceSignerAccount ||
        !!designatedCosignerAccounts.filter((cosigner) => cosigner.publicKey === sourcePubAccount.publicKey).shift()
    ) && (
        signerPubAccount.equals(targetPubAccount) ||
        !!targetSignerAccount ||
        !!designatedCosignerAccounts.filter((cosigner) => cosigner.publicKey === targetPubAccount.publicKey).shift()
    );

    if (!hasEnoughCosigners) {
        Logger.warn("You need more cosigner(s) to announce TXs.");
    }

    return {
        hasEnoughCosigners,
        designatedCosignerAccounts,
    };
};

export const buildAndExecuteBatches = async (
    txs: InnerTransaction[],
    signerAccount: Account,
    cosignerAccounts: Account[],
    feeRatio: number,
    maxParallels: number,
    canAnnounce: boolean,
    showPrompt: boolean,
) => {
    const { networkProperties } = await symbolService.getNetwork();
    const batchSize = Number(networkProperties.plugins.aggregate?.maxTransactionsPerAggregate || 100);

    const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
        txs,
        signerAccount,
        cosignerAccounts,
        feeRatio,
        batchSize,
    );
    const totalFee = batches.reduce(
        (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
    );

    if (canAnnounce) {
        Logger.info(
            `Announcing ${batches.length} aggregate TXs ` +
            `with fee ${SymbolService.toXYM(Long.fromString(totalFee.toString()))} XYM total.`
        );
        if (showPrompt) {
            const decision = (await prompts({
                type: "confirm",
                name: "decision",
                message: "Are you sure announce these TXs?",
                initial: true,
                stdout: process.stderr,
            })).decision;
            if (!decision) {
                throw new Error("Canceled by user.");
            }
        }

        const startAt = moment.now();
        const errors = await symbolService.executeBatches(batches, signerAccount, maxParallels);
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
        batches,
        totalFee,
    };
};

export const doVerify = async (
    payload: Uint8Array,
    type: MetadataType,
    sourceAddress: Address,
    targetAddress: Address,
    key: UInt64,
    targetId?: MosaicId | NamespaceId,
) => {
    Logger.debug(`Verifying the metal key:${key.toHex()},Source:${sourceAddress.plain()},${
        [ `Account:${targetAddress.plain()}`, `Mosaic:${targetId?.toHex()}`, `Namespace:${targetId?.toHex()}` ][type]
    }`);
    const { mismatches, maxLength } = await metalService.verify(
        payload,
        type,
        sourceAddress,
        targetAddress,
        key,
        targetId,
    );
    if (mismatches) {
        throw new Error(`Verify error: Mismatch rate is ${mismatches / maxLength * 100}%`);
    } else {
        Logger.info(`Verify succeeded: No mismatches found.`);
    }
};
