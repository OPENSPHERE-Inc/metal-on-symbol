import {Utils} from "../../libs";
import Long from "long";
import {IntermediateOutput} from "../intermediate";
import moment from "moment";


export namespace ReinforceOutput {

    export interface CommandlineOutput extends IntermediateOutput {
        status: "reinforced" | "estimated";
        payload: Buffer;
    }

    export const printOutputSummary = (output: CommandlineOutput) => {
        console.log(
            `\n  --- Summary of Reinforcement ${
                output.status === "estimated" ? "(Estimate)" : "(Receipt)"
            } ---\n` +
            `  Metal ID: ${output.metalId}\n` +
            `  Command: ${output.command === "forge" ? "Forge" : "Scrap"}\n` +
            `  Type: ${output.mosaicId ? "Mosaic" : output.namespaceId ? "Namespace" : "Account" }\n` +
            `  Source Account Address: ${output.sourceAccount.address.plain()}\n` +
            `  Target Account Address: ${output.targetAccount.address.plain()}\n` +
            (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
            (output.namespaceId ? `  Namespace ID: ${output.namespaceId.toHex()}\n` : "") +
            `  Metadata Key: ${output.key?.toHex()}\n` +
            `  Additive: ${output.additive}\n` +
            `  Data size: ${output.payload.length}\n` +
            `  # of Aggregate TXs: ${output.batches.length}\n` +
            `  TX Fee: ${Utils.toXYM(Long.fromString(output.totalFee.toString()))} XYM\n` +
            `  Signer Address: ${output.signerAccount.address.plain()}\n` +
            `  Network Type: ${output.networkType}\n` +
            `  Timestamp: ${moment(output.createdAt).format("YYYY-MM-DD HH:mm:ss")}\n`
        );
    };

}

