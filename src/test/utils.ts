import assert from "assert";
import {SymbolService} from "../services/symbol";
import {Account, CosignatureTransaction, InnerTransaction, UInt64} from "symbol-sdk";


export const initTestEnv = () => {
    assert(process.env.NODE_URL);

    SymbolService.init({
        emit_mode: true,
        node_url: process.env.NODE_URL,
        fee_ratio: 0.35,
        logging: true,
        deadline_hours: 6,
    });
};


export namespace SymbolTest {

    export const getNamedAccounts = async () => {
        assert(process.env.SIGNER1_PRIVATE_KEY);
        assert(process.env.PAYER_PRIVATE_KEY);

        const { networkType } = await SymbolService.getNetwork();
        return {
            signer1: Account.createFromPrivateKey(process.env.SIGNER1_PRIVATE_KEY, networkType),
            payer: Account.createFromPrivateKey(process.env.PAYER_PRIVATE_KEY, networkType),
        };
    };

    export const doAggregateTx = async (txs: InnerTransaction[], signer: Account, cosigners: Account[]) => {
        const aggregateTx = await SymbolService.composeAggregateCompleteTx(
            await SymbolService.getFeeMultiplier(0),
            cosigners.length,
            txs
        );
        const { networkGenerationHash } = await SymbolService.getNetwork();
        const signedTx = signer.sign(aggregateTx, networkGenerationHash);
        const cosignatures = cosigners.map(
            (cosigner) => CosignatureTransaction.signTransactionHash(cosigner, signedTx.hash)
        );
        await SymbolService.announceTxWithCosignatures(signedTx, cosignatures);
        return (await SymbolService.waitTxsFor(signer, signedTx.hash, "confirmed")).shift();
    };

    export const doAggregateTxBatches = async (
        txs: InnerTransaction[],
        signer: Account,
        cosigners: Account[],
        batchSize: number,
        maxParallels: number,
        batchesCreatedCallback?: (batches: SymbolService.SignedAggregateTx[], totalFee: UInt64) => void,
    ) => {
        const batches = await SymbolService.buildSignedAggregateCompleteTxBatches(
            txs,
            signer,
            cosigners,
            0,
            batchSize,
        );
        const totalFee = batches.reduce(
            (acc, curr) => acc.add(curr.maxFee), UInt64.fromUint(0)
        );

        batchesCreatedCallback?.(batches, totalFee);

        return SymbolService.executeBatches(batches, signer, maxParallels);
    };
}