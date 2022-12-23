import Long from "long";
import {IntermediateOutput} from "../intermediate";
import moment from "moment";
import {Logger} from "../../libs";
import {SymbolService} from "../../services";


export namespace ReinforceOutput {

    export interface CommandlineOutput extends IntermediateOutput {
        status: "reinforced" | "estimated";
        payload: Uint8Array;
    }

    export const printOutputSummary = (output: CommandlineOutput) => {
        Logger.info(
            `\n  --- Summary of Reinforcement ${
                output.status === "estimated" ? "(Estimate)" : "(Receipt)"
            } ---\n` +
            `  Metal ID: ${output.metalId}\n` +
            `  Command: ${output.command === "forge" ? "Forge" : "Scrap"}\n` +
            `  Type: ${output.mosaicId ? "Mosaic" : output.namespaceId ? "Namespace" : "Account" }\n` +
            `  Source Account Address: ${output.sourcePubAccount.address.plain()}\n` +
            `  Target Account Address: ${output.targetPubAccount.address.plain()}\n` +
            (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
            (output.namespaceId ? `  Namespace ID: ${output.namespaceId.toHex()}\n` : "") +
            `  Metadata Key: ${output.key?.toHex()}\n` +
            `  Additive: ${output.additive}\n` +
            `  Data size: ${output.payload.length}\n` +
            `  # of Aggregate TXs: ${output.batches?.length || output.undeadBatches?.length}\n` +
            `  TX Fee: ${SymbolService.toXYM(Long.fromString(output.totalFee.toString()))} XYM\n` +
            `  Signer Address: ${output.signerPubAccount.address.plain()}\n` +
            `  Network Type: ${output.networkType}\n` +
            `  Timestamp: ${moment(output.createdAt).format("YYYY-MM-DD HH:mm:ss")}\n`
        );
    };

}

