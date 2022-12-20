import {Account, PublicAccount} from "symbol-sdk";
import {VERSION} from "../forge/version";
import {initCliEnv, isValueOption, NodeInput, symbolService} from "../common";
import {Logger} from "../../libs";
import {StreamInput, validateStreamInput} from "../stream";
import prompts from "prompts";
import {PACKAGE_VERSION} from "../../package_version";


export namespace DecryptInput {

    export interface CommandlineInput extends NodeInput, StreamInput {
        version: string;
        encryptSenderPublicKey?: string;
        encryptRecipientPrivateKey?: string;
        force: boolean;
        outputPath?: string;

        // Filled by validator
        encryptRecipientAccount?: Account;
        encryptSenderPubAccount?: PublicAccount;
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

                case "--verbose": {
                    Logger.init({ log_level: Logger.LogLevel.DEBUG });
                    break;
                }

                case "--version": {
                    throw "version";
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

        if (!input.encryptRecipientPrivateKey && !input.force && !input.stdin) {
            input.encryptRecipientPrivateKey = (await prompts({
                type: "password",
                name: "private_key",
                message: "Recipient's Private Key?",
                stdout: process.stderr,
            })).private_key;
        }

        const { networkType } = await symbolService.getNetwork();
        if (input.encryptRecipientPrivateKey) {
            input.encryptRecipientAccount = Account.createFromPrivateKey(input.encryptRecipientPrivateKey, networkType);
        } else {
            throw new Error(
                "Recipient's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
            );
        }

        if (input.encryptSenderPublicKey) {
            input.encryptSenderPubAccount = PublicAccount.createFromPublicKey(
                input.encryptSenderPublicKey,
                networkType
            );
        }

        return input;
    };

    export const printUsage = () => {
        Logger.info(
            `Usage: decrypt [options] [input_path]\n` +
            `Options:\n` +
            `  input_path             Specify input_path of plain file (default:stdin)\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  --from public_key      Specify encryption sender's public_key (default:recipient)\n` +
            `  -h, --help             Show command line usage\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_path,\n` +
            `  --out value            Specify output_path that will be saved encrypted binary (default:stdout)\n` +
            `  --priv-key value       Specify encryption recipient's private_key\n` +
            `  --verbose              Show verbose logs\n` +
            `  --version              Show command version\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify recipient's private_key\n`
        );
    };

    export const printVersion = () => {
        Logger.info(`Metal Decrypt CLI version ${VERSION} (${PACKAGE_VERSION})\n`);
    };
}