import {Account, PublicAccount} from "symbol-sdk";
import {VERSION} from "../forge/version";
import {initCliEnv, isValueOption} from "../common";
import PromptSync from "prompt-sync";
import {SymbolService} from "../../services";
import {Logger} from "../../libs";
import {StreamInput, validateStreamInput} from "../stream";


export namespace DecryptInput {

    const prompt = PromptSync();

    export interface CommandlineInput extends StreamInput {
        version: string;
        encryptSenderPublicKey?: string;
        encryptRecipientPrivateKey?: string;
        force: boolean;
        nodeUrl?: string;
        outputPath?: string;

        // Filled by validator
        encryptRecipient?: Account;
        encryptSenderAccount?: PublicAccount;
        stdout?: boolean;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            force: false,
            nodeUrl: process.env.NODE_URL,
            encryptRecipientPrivateKey: process.env.SIGNER_PRIVATE_KEY,
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "--priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has private_key as a value.`);
                    }
                    input.encryptRecipientPrivateKey = value;
                    break;
                }

                case "--from": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has public_key as a value.`);
                    }
                    input.encryptSenderPublicKey = value;
                    break;
                }

                case "-f":
                case "--force": {
                    input.force = true;
                    break;
                }

                case "-h":
                case "--help": {
                    throw "help";
                }

                case "--node-url": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has node_url as a value.`);
                    }
                    input.nodeUrl = value;
                    break;
                }

                case "-o":
                case "--out": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has output_path as a value.`);
                    }
                    input.outputPath = value;
                    break;
                }

                default: {
                    if (token.startsWith("-")) {
                        throw new Error(`Unknown option ${token}`);
                    }

                    // We'll use only first one.
                    if (!input.filePath) {
                        input.filePath = token;
                    }
                    break;
                }
            }
        }

        return input;
    };

    // Initializing CLI environment
    export const validateInput = async (_input: Readonly<CommandlineInput>) => {
        let input: CommandlineInput = { ..._input };
        if (!input.nodeUrl) {
            throw new Error("Node URL wasn't specified. [--node-url value] or NODE_URL is required.");
        }

        await initCliEnv(input.nodeUrl, 0);

        input = await validateStreamInput(input, !input.force);

        if (!input.encryptRecipientPrivateKey && !input.force && !input.stdin && !input.stdout) {
            input.encryptRecipientPrivateKey = prompt("Recipient's Private Key? ", "", { echo: "*" });
        }

        const { networkType } = await SymbolService.getNetwork();
        if (input.encryptRecipientPrivateKey) {
            input.encryptRecipient = Account.createFromPrivateKey(input.encryptRecipientPrivateKey, networkType);
        } else {
            throw new Error(
                "Recipient's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
            );
        }

        if (input.encryptSenderPublicKey) {
            input.encryptSenderAccount = PublicAccount.createFromPublicKey(
                input.encryptSenderPublicKey,
                networkType
            );
        }

        return input;
    };

    export const printUsage = () => {
        Logger.error(
            `Usage: decrypt [options] [input_path]\n` +
            `Options:\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  --from public_key      Specify encryption sender's public_key (default:recipient)\n` +
            `  -h, --help             Show command line usage\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_path,\n` +
            `  --out value            Specify output_path that will be saved encrypted binary\n` +
            `  --priv-key value       Specify encryption recipient's private_key\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify recipient's private_key\n`
        );
    };
}