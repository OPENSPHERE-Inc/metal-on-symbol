import Long from "long";
import moment from "moment";
import prompts from "prompts";
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
import { Logger } from "../../libs";
import { AggregateUndeadTransaction, NecromancyService, SignedAggregateTx, SymbolService } from "../../services";
import { MetalService } from "../../services/compat";


export const isValueOption = (token?: string) => !token?.startsWith("-");
export let symbolService: SymbolService;
export let metalService: MetalService;
export let necromancyService: NecromancyService;
export const deadlineMinHours = 5;
export const deadlineMarginHours = 1;

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
        deadline_hours: deadlineMinHours,
    });

    const { networkType } = await symbolService.getNetwork();
    Logger.debug(`Using Node URL: ${input.nodeUrl} (network_type:${networkType})`);

    metalService = new MetalService(symbolService);
    necromancyService = new NecromancyService(symbolService, {
        deadlineUnitHours: symbolService.config.deadline_hours,
        deadlineMarginHours: deadlineMarginHours,
    });
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

export const announceBatches = async (
    batches: SignedAggregateTx[],
    signerAccount: Account | PublicAccount,
    maxParallels: number,
    showPrompt: boolean
) => {
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
};

interface ExecuteBatchesResult {
    totalFee: UInt64,
    batches?: SignedAggregateTx[],
    undeadBatches?: AggregateUndeadTransaction[],
}

export const buildAndExecuteBatches = async (
    txs: InnerTransaction[],
    signerAccount: Account,
    cosignerAccounts: Account[],
    feeRatio: number,
    requiredCosignatures: number,
    maxParallels: number,
    canAnnounce: boolean,
    showPrompt: boolean,
): Promise<ExecuteBatchesResult> => {
    const { networkProperties } = await symbolService.getNetwork();
    const batchSize = Number(networkProperties.plugins.aggregate?.maxTransactionsPerAggregate || 100);

    const batches = await symbolService.buildSignedAggregateCompleteTxBatches(
        txs,
        signerAccount,
        cosignerAccounts,
        feeRatio,
        batchSize,
        requiredCosignatures,
    );

    const totalFee = batches.reduce(
        (acc, curr) => acc.add(curr.maxFee),
        UInt64.fromUint(0)
    );

    if (canAnnounce) {
        Logger.info(
            `Announcing ${batches.length} aggregate TXs ` +
            `with fee ${SymbolService.toXYM(Long.fromString(totalFee.toString()))} XYM total.`
        );
       await announceBatches(
           batches,
           signerAccount,
           maxParallels,
           showPrompt
       );
    }

    return {
        batches,
        totalFee,
    };
};

export const buildAndExecuteUndeadBatches = async (
    txs: InnerTransaction[],
    signerAccount: Account,
    cosignerAccounts: Account[],
    feeRatio: number,
    requiredCosignatures: number,
    deadlineHours: number,
    maxParallels: number,
    canAnnounce: boolean,
    showPrompt: boolean,
): Promise<ExecuteBatchesResult> => {
    const { networkProperties } = await symbolService.getNetwork();
    const batchSize = Number(networkProperties.plugins.aggregate?.maxTransactionsPerAggregate || 100) - 1;

    const undeadBatches = await necromancyService.buildTxBatches(
        deadlineHours,
        txs,
        signerAccount,
        cosignerAccounts,
        feeRatio,
        batchSize,
        requiredCosignatures,
    );

    const totalFee = undeadBatches.reduce(
        (acc, curr) => acc.add(curr.aggregateTx.maxFee),
        UInt64.fromUint(0)
    );

    if (canAnnounce) {
        Logger.info(
            `Announcing ${undeadBatches.length} aggregate TXs ` +
            `with fee ${SymbolService.toXYM(Long.fromString(totalFee.toString()))} XYM total.`
        );
        await announceBatches(
            await necromancyService.pickAndCastTxBatches(undeadBatches),
            signerAccount,
            maxParallels,
            showPrompt
        );
    }

    return {
        undeadBatches,
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
