import {VERSION} from "./version";
import {PACKAGE_VERSION} from "../../package_version";
import assert from "assert";
import {DecryptInput} from "./input";
import {SymbolService} from "../../services";
import {DecryptOutput} from "./output";
import {Logger} from "../../libs";
import {readStreamInput, writeStreamOutput} from "../stream";


export namespace DecryptCLI {

    export const main = async (argv: string[]) => {
        Logger.log(`Metal Decrypt CLI version ${VERSION} (${PACKAGE_VERSION})\n`);

        let input: DecryptInput.CommandlineInput;
        try {
            input = await DecryptInput.validateInput(DecryptInput.parseInput(argv));
        } catch (e) {
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