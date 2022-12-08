import assert from "assert";
import {EncryptInput} from "./input";
import {SymbolService} from "../../services";
import {EncryptOutput} from "./output";
import {readStreamInput, writeStreamOutput} from "../stream";


export namespace EncryptCLI {

    export const main = async (argv: string[]) => {
        let input: EncryptInput.CommandlineInput;
        try {
            input = await EncryptInput.validateInput(EncryptInput.parseInput(argv));
        } catch (e) {
            EncryptInput.printVersion();
            if (e === "version") {
                return;
            }
            EncryptInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        // Read input file contents here.
        const payload = await readStreamInput(input);

        // Encrypt payload here.
        assert(input.encryptSenderAccount);
        const encryptRecipientPubAccount = input.encryptRecipientPubAccount || input.encryptSenderAccount.publicAccount;
        const encryptedPayload = SymbolService.encryptBinary(
            payload,
            input.encryptSenderAccount,
            encryptRecipientPubAccount
        );

        // Output encrypt file here.
        writeStreamOutput(encryptedPayload, input.outputPath);

        const output: EncryptOutput.CommandlineOutput = {
            payload: encryptedPayload,
            senderPubAccount: input.encryptSenderAccount.publicAccount,
            recipientPubAccount: encryptRecipientPubAccount,
        };

        return output;
    }

}