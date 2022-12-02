import {SymbolService} from "../services/symbol";
import {
    Account,
    Address,
    InnerTransaction,
    MetadataType,
    MosaicId,
    NamespaceId, PublicAccount,
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
        node_url: nodeUrl,
        fee_ratio: feeRatio,
        logging: true,
        deadline_hours: 5,
    });

    const { networkType } = await SymbolService.getNetwork();
    console.log(`Using Node URL: ${nodeUrl} (network_type:${networkType})`);
};

export const designateCosigners = (
    signerAccount: PublicAccount,
    sourceAccount: PublicAccount,
    targetAccount: PublicAccount,
    sourceSigner?: Account,
    targetSigner?: Account,
    cosigners?: Account[]
) => {
    const designatedCosigners = new Array<Account>(...(cosigners || []));
    if (!signerAccount.equals(sourceAccount) && sourceSigner) {
        designatedCosigners.push(sourceSigner);
    }
    if (!signerAccount.equals(targetAccount) && targetSigner) {
        designatedCosigners.push(targetSigner);
    }

    const hasEnoughCosigners = (
        signerAccount.equals(sourceAccount) ||
        !!sourceSigner ||
        !!designatedCosigners.filter((cosigner) => cosigner.publicKey === sourceAccount.publicKey).shift()
    ) && (
        signerAccount.equals(targetAccount) ||
        !!targetSigner ||
        !!designatedCosigners.filter((cosigner) => cosigner.publicKey === targetAccount.publicKey).shift()
    );

    if (!hasEnoughCosigners) {
        console.warn("You need more cosigner(s) to announce TXs.");
    }

    return {
        hasEnoughCosigners,
        designatedCosigners,
    };
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
            const decision = prompt("Are you sure announce these TXs [(y)/n]? ", "y");
            if (decision.toLowerCase() !== "y") {
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
    console.log(`Verifying the metal key:${key.toHex()},Source:${sourceAddress.plain()},${
        type === MetadataType.Mosaic
            ? `Mosaic:${targetId?.toHex()}`
            : type === MetadataType.Namespace
                ? `Namespace:${targetId?.toHex()}`
                : `Account:${targetAddress.plain()}`
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
