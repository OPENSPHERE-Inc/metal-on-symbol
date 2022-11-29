import {toXYM} from "../../libs/utils";
import Long from "long";
import {IntermediateOutput} from "../intermediate";


export namespace ForgeOutput {

    export interface CommandlineOutput extends IntermediateOutput {
        status: "forged" | "estimated";
    }

    export const printOutputSummary = (output: CommandlineOutput) => {
        console.log(
            `\n  --- Summary of Forging ${
                output.status === "estimated" ? "(Estimate)" : "(Receipt)"
            } Summary ---\n` +
            `  Metal ID: ${output.metalId}\n` +
            `  Type: ${output.mosaicId ? "Mosaic" : output.namespaceId ? "Namespace" : "Account" }\n` +
            `  Source Account Address: ${output.sourceAccount.address.plain()}\n` +
            `  Target Account Address: ${output.targetAccount.address.plain()}\n` +
            (output.mosaicId ? `  Mosaic ID: ${output.mosaicId.toHex()}\n` : "") +
            (output.namespaceId ? `  Namespace ID: ${output.namespaceId.fullName} (${output.namespaceId.toHex()})\n` : "") +
            `  Metadata Key: ${output.key?.toHex()}\n` +
            `  Additive: ${output.additive}\n` +
            `  # of Aggregate TXs: ${output.batches.length}\n` +
            `  TX Fee: ${toXYM(Long.fromString(output.totalFee.toString()))} XYM\n` +
            `  Signer Address: ${output.signerAccount.address.plain()}\n` +
            `  Network Type: ${output.networkType}\n`
        );
    };

}


