import {VERSION} from "./version";
import {PACKAGE_VERSION} from "../../package_version";
import assert from "assert";
import {EncryptInput} from "./input";
import {SymbolService} from "../../services";
import {EncryptOutput} from "./output";
import {Logger} from "../../libs";
import {readStreamInput, writeStreamOutput} from "../stream";


export namespace EncryptCLI {

    export const main = async (argv: string[]) => {
        Logger.log(`Metal Encrypt CLI version ${VERSION} (${PACKAGE_VERSION})\n`);

        let input: EncryptInput.CommandlineInput;
        try {
            input = await EncryptInput.validateInput(EncryptInput.parseInput(argv));
        } catch (e) {
            EncryptInput.printUsage();
            if (e === "help") {
                return;
            }
            throw e;
        }

        // Read input file contents here.
        const payload = await readStreamInput(input);

        // Encrypt payload here.
        assert(input.encryptSender);
        const encryptRecipientAccount = input.encryptRecipientAccount || input.encryptSender.publicAccount;
        const encryptedPayload = SymbolService.encryptBinary(
            payload,
            input.encryptSender,
            encryptRecipientAccount
        );

        // Output encrypt file here.
        writeStreamOutput(encryptedPayload, input.outputPath);

        const output: EncryptOutput.CommandlineOutput = {
            payload: encryptedPayload,
            senderAccount: input.encryptSender.publicAccount,
            recipientAccount: encryptRecipientAccount,
        };

        return output;
    }

}