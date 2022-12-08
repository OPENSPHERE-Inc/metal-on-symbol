import assert from "assert";
import {DecryptInput} from "./input";
import {SymbolService} from "../../services";
import {DecryptOutput} from "./output";
import {readStreamInput, writeStreamOutput} from "../stream";


export namespace DecryptCLI {

    export const main = async (argv: string[]) => {
        let input: DecryptInput.CommandlineInput;
        try {
            input = await DecryptInput.validateInput(DecryptInput.parseInput(argv));
        } catch (e) {
            DecryptInput.printVersion();
            if (e === "version") {
                return;
            }
            DecryptInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        // Read input file contents here.
        const payload = await readStreamInput(input);

        // Encrypt payload here.
        assert(input.encryptRecipient);
        const encryptSenderAccount = input.encryptSenderAccount || input.encryptRecipient.publicAccount;
        const decryptedPayload = SymbolService.decryptBinary(
            payload,
            encryptSenderAccount,
            input.encryptRecipient
        );

        // Output encrypt file here.
        writeStreamOutput(decryptedPayload, input.outputPath);

        const output: DecryptOutput.CommandlineOutput = {
            payload: decryptedPayload,
            senderAccount: encryptSenderAccount,
            recipientAccount: input.encryptRecipient.publicAccount,
        };

        return output;
    }

}