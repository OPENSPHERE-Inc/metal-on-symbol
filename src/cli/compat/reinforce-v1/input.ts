import {Account} from "symbol-sdk";
import fs from "fs";
import {initCliEnv, isValueOption, NodeInput, symbolService} from "../common";
import {VERSION} from "./version";
import {Logger} from "../../../libs";
import {StreamInput, validateStreamInput} from "../../stream";
import prompts from "prompts";
import {PACKAGE_VERSION} from "../../../package_version";


export namespace ReinforceInputV1 {

    export interface CommandlineInput extends NodeInput, StreamInput {
        version: string;
        announce: boolean;
        cosignerPrivateKeys?: string[];
        force: boolean;
        intermediatePath?: string;
        maxParallels: number;
        outputPath?: string;
        signerPrivateKey?: string;

        // Filled by validateInput
        cosignerAccounts?: Account[];
        signerAccount?: Account;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            maxParallels: 10,
            force: false,
            nodeUrl: process.env.NODE_URL,
            signerPrivateKey: process.env.SIGNER_PRIVATE_KEY,
            announce: false,
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "-a":
                case "--announce": {
                    input.announce = true;
                    break;
                }

                case "--cosigner": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has cosigner's private_key as a value.`);
                    }
                    input.cosignerPrivateKeys = [ ...(input.cosignerPrivateKeys || []), value ];
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

                case "--parallels": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has number as a value.`);
                    }
                    input.maxParallels = Number(value);
                    break;
                }

                case "--priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has signer's private_key as a value.`);
                    }
                    input.signerPrivateKey = value;
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
                    if (!input.intermediatePath) {
                        input.intermediatePath = token;
                    } else if (!input.filePath) {
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

        if (!input.intermediatePath) {
            throw new Error("[intermediate_txs.json] wasn't specified.");
        }
        if (!fs.existsSync(input.intermediatePath)) {
            throw new Error(`${input.intermediatePath}: File not found.`);
        }

        const { networkType } = await symbolService.getNetwork();

        if (!input.signerPrivateKey && !input.force && !input.stdin) {
            input.signerPrivateKey = (await prompts({
                type: "password",
                name: "private_key",
                message: "Cosigner's Private Key [enter:skip]?",
                stdout: process.stderr,
            })).private_key;
        }
        if (input.signerPrivateKey) {
            input.signerAccount = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
            Logger.info(`Signer Address is ${input.signerAccount.address.plain()}`);
        }

        input.cosignerAccounts = input.cosignerPrivateKeys?.map(
            (privateKey) => {
                const cosigner = Account.createFromPrivateKey(privateKey, networkType)
                Logger.info(`Additional Cosigner Address is ${cosigner.address.plain()}`);
                return cosigner;
            }
        );

        return input;
    };

    export const printUsage = () => {
        Logger.info(
            `Usage: reinforce-v1 [options] intermediate_txs.json input_path\n` +
            `Options:\n` +
            `  -a, --announce         Announce completely signed TXs\n` +
            `  --cosigner private_key Specify multisig cosigner's private_key (You can set multiple)\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  -h, --help             Show command line usage\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_path.json,\n` +
            `  --out value            Specify JSON file output_path.json that will contain serialized TXs\n` +
            `  --parallels value      Max TXs for parallel announcing (default:10)\n` +
            `  --priv-key value       Specify cosigner's private_key (Same as single of [--cosigner])\n` +
            `  --verbose              Show verbose logs\n` +
            `  --version              Show command version\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private_key\n`
        );
    };

    export const printVersion = () => {
        Logger.info(`Metal Reinforce CLI version ${VERSION} (${PACKAGE_VERSION})\n`);
    };

}

