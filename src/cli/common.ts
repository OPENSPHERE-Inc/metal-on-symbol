import {SymbolService} from "../services/symbol";
import {
    Account,
    Address,
    InnerTransaction,
    MetadataType,
    MosaicId,
    NamespaceId,
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
        deadline_hours: 6,
    });

    const { networkType } = await SymbolService.getNetwork();
    console.log(`Using node url: ${nodeUrl} (network_type:${networkType})`);
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
        console.log(
            `Announcing ${batches.length} aggregate TXs ` +
            `with fee ${toXYM(Long.fromString(totalFee.toString()))} XYM total.`
        );
        if (usePrompt) {
            const decision = prompt("Are you sure announce these TXs [(y)/n]? ", "Y");
            if (decision !== "Y" && decision !== "y") {
                throw Error("Canceled by user.");
            }
        }

        const startAt = moment.now();
        const errors = await SymbolService.executeBatches(batches, signer, maxParallels);
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
        batches,
        totalFee,
    };
};

export const doVerify = async (
    payload: Buffer,
    type: MetadataType,
    sourceAddress: Address,
    targetAddress: Address,
    key: UInt64,
    targetId?: MosaicId | NamespaceId,
) => {
    console.log(`Verifying metal key:${key.toHex()},source:${sourceAddress.plain()},${
        type === MetadataType.Mosaic
            ? `mosaic:${targetId?.toHex()}`
            : type === MetadataType.Namespace
                ? `namespace:${(targetId as NamespaceId)?.fullName}`
                : `account:${targetAddress.plain()}`
    }`);
    const { mismatches, maxLength } = await MetalService.verify(
        payload,
        type,
        sourceAddress,
        targetAddress,
        key,
        targetId,
    );
    if (mismatches) {
        throw Error(`Verify error: Mismatch rate is ${mismatches / maxLength * 100}%`);
    } else {
        console.log(`Verify succeeded: No mismatches found.`);
    }
};
