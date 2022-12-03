import {Account} from "symbol-sdk";
import fs from "fs";
import {initCliEnv, isValueOption} from "../common";
import {VERSION} from "./version";
import PromptSync from "prompt-sync";
import {SymbolService} from "../../services";


export namespace ReinforceInput {

    const prompt = PromptSync();

    export interface CommandlineInput {
        version: string;
        announce: boolean;
        cosignerPrivateKeys?: string[];
        filePath?: string;
        force: boolean;
        intermediatePath?: string;
        maxParallels: number;
        nodeUrl?: string;
        outputPath?: string;
        signerPrivateKey?: string;

        // Filled by validateInput
        cosigners?: Account[];
        signer?: Account;
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
                        throw Error(`${token} must has cosigner's private_key as a value.`);
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
                        throw Error(`${value} must has node_url as a value.`);
                    }

                    input.nodeUrl = value;
                    break;
                }

                case "-o":
                case "--out": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has output_path as a value.`);
                    }
                    input.outputPath = value;
                    break;
                }

                case "--parallels": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has number as a value.`);
                    }
                    input.maxParallels = Number(value);
                    break;
                }

                case "--priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has signer's private_key as a value.`);
                    }
                    input.signerPrivateKey = value;
                    break;
                }

                default: {
                    if (token.startsWith("-")) {
                        throw Error(`Unknown option ${token}`);
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
    export const validateInput = async (input: CommandlineInput) => {
        if (!input.nodeUrl) {
            throw Error("Node URL wasn't specified. [--node-url value] or NODE_URL is required.");
        }

        await initCliEnv(input.nodeUrl, 0);

        if (!input.intermediatePath) {
            throw Error("[intermediate_txs.json] wasn't specified.");
        }
        if (!fs.existsSync(input.intermediatePath)) {
            throw Error(`${input.intermediatePath}: File not found.`);
        }

        if (!input.filePath) {
            throw Error("[input_file] wasn't specified.")
        }
        if (!fs.existsSync(input.filePath)) {
            throw Error(`${input.filePath}: File not found.`);
        }

        if (input.outputPath && !input.force && fs.existsSync(input.outputPath)) {
            if (prompt(`${input.outputPath}: Are you sure overwrite this [y/(n)]? `).toLowerCase() !== "y") {
                throw new Error(`Canceled by user.`);
            }
        }

        const { networkType } = await SymbolService.getNetwork();

        if (!input.signerPrivateKey && !input.force) {
            input.signerPrivateKey = prompt("Cosigner Private Key [Enter:skip]? ", "", { echo: "*" });
        }
        if (input.signerPrivateKey) {
            input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
            console.log(`Signer Address is ${input.signer.address.plain()}`);
        }

        input.cosigners = input.cosignerPrivateKeys?.map(
            (privateKey) => {
                const cosigner = Account.createFromPrivateKey(privateKey, networkType)
                console.log(`Additional Cosigner Address is ${cosigner.address.plain()}`);
                return cosigner;
            }
        );

        return input;
    };

    export const printUsage = () => {
        console.error(
            `Usage: reinforce [options] intermediate_txs.json input_file\n` +
            `Options:\n` +
            `  -a, --announce         Announce completely signed TXs\n` +
            `  --cosigner private_key Specify multisig cosigner's private_key (You can set multiple)\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  -h, --help             Show command line usage\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_file.json,\n` +
            `  --out value            Specify JSON file output_path that will contain serialized TXs\n` +
            `  --parallels value      Max TXs for parallel announcing (default:10)\n` +
            `  --priv-key value       Specify cosigner's private_key (Same as [--cosigner])\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private_key\n`
        );
    };

}

