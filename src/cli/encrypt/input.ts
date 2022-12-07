import {Account, PublicAccount} from "symbol-sdk";
import {VERSION} from "../forge/version";
import {initCliEnv, isValueOption, NodeInput} from "../common";
import PromptSync from "prompt-sync";
import {SymbolService} from "../../services";
import {Logger} from "../../libs";
import {StreamInput, validateStreamInput} from "../stream";


export namespace EncryptInput {

    const prompt = PromptSync();

    export interface CommandlineInput extends NodeInput, StreamInput {
        version: string;
        encryptSenderPrivateKey?: string;
        encryptRecipientPublicKey?: string;
        force: boolean;
        outputPath?: string;

        // Filled by validator
        encryptSender?: Account;
        encryptRecipientAccount?: PublicAccount;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            force: false,
            nodeUrl: process.env.NODE_URL,
            encryptSenderPrivateKey: process.env.SIGNER_PRIVATE_KEY,
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "--priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has private_key as a value.`);
                    }
                    input.encryptSenderPrivateKey = value;
                    break;
                }

                case "--to": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has public_key as a value.`);
                    }
                    input.encryptRecipientPublicKey = value;
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

        await initCliEnv(input, 0);

        input = await validateStreamInput(input, !input.force);

        if (!input.encryptSenderPrivateKey && !input.force && !input.stdout && !input.stdin) {
            input.encryptSenderPrivateKey = prompt("Sender's Private Key? ", "", { echo: "*" });
        }

        const { networkType } = await SymbolService.getNetwork();
        if (input.encryptSenderPrivateKey) {
            input.encryptSender = Account.createFromPrivateKey(input.encryptSenderPrivateKey, networkType);
        } else {
            throw new Error(
                "Sender's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
            );
        }

        if (input.encryptRecipientPublicKey) {
            input.encryptRecipientAccount = PublicAccount.createFromPublicKey(
                input.encryptRecipientPublicKey,
                networkType
            );
        }

        return input;
    };

    export const printUsage = () => {
        Logger.error(
            `Usage: encrypt [options] [input_path]\n` +
            `Options:\n` +
            `  input_path             Specify input_path of encrypted file (default:stdin)\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  -h, --help             Show command line usage\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_path,\n` +
            `  --out value            Specify output_path that will be saved encrypted binary (default:stdout)\n` +
            `  --priv-key value       Specify encryption sender's private_key\n` +
            `  --to public_key        Specify encryption recipient's public_key (default:sender)\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify sender's private_key\n`
        );
    };
}