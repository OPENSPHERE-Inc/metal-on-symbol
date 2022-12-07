import {Address, MetadataType, MosaicId, UInt64} from "symbol-sdk";
import {initCliEnv, isValueOption} from "../common";
import {SymbolService} from "../../services";
import {VERSION} from "./version";
import {MetalIdentifyInput, validateMetalIdentifyInput} from "../metal_id";
import {Logger} from "../../libs";
import {validateStreamInput} from "../stream";


export namespace FetchInput {

    export interface CommandlineInput extends MetalIdentifyInput {
        version: string;
        nodeUrl?: string;
        noSave: boolean;
        outputPath?: string;
        force: boolean;
        stdout: boolean;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            nodeUrl: process.env.NODE_URL,
            signerPrivateKey: process.env.SIGNER_PRIVATE_KEY,
            type: MetadataType.Account,
            noSave: false,
            force: false,
            stdout: false,
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "-f":
                case "--force": {
                    input.force = true;
                    break;
                }

                case "-h":
                case "--help": {
                    throw "help";
                }

                case "-k":
                case "--key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has metadata_key (HEX) as a value.`);
                    }
                    input.key = UInt64.fromHex(value);
                    break;
                }

                case "-m":
                case "--mosaic": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has mosaic_id as a value.`);
                    }
                    if (input.type !== MetadataType.Account) {
                        throw new Error("You cannot specify --mosaic and --namespace more than once, or both.")
                    }

                    input.type = MetadataType.Mosaic;
                    input.mosaicId = new MosaicId(value);
                    break;
                }

                case "-n":
                case "--namespace": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has namespace_name as a value.`);
                    }
                    if (input.type !== MetadataType.Account) {
                        throw new Error("You cannot specify --mosaic and --namespace more than once, or both.")
                    }

                    input.type = MetadataType.Namespace;
                    input.namespaceId = SymbolService.createNamespaceId(value);
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

                case "--node-url": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has node_url as a value.`);
                    }

                    input.nodeUrl = value;
                    break;
                }

                case "--no-save": {
                    input.noSave = true;
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

                case "--stdout": {
                    input.stdout = true;
                    break;
                }

                case "-s":
                case "--src-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has public_key as a value.`);
                    }
                    input.sourcePublicKey = value;
                    break;
                }

                case "--src-addr": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has address as a value.`);
                    }
                    input.sourceAddress = Address.createFromRawAddress(value);
                    break;
                }

                case "-t":
                case "--tgt-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has public_key as a value.`);
                    }
                    input.targetPublicKey = value;
                    break;
                }

                case "--tgt-addr": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has address as a value.`);
                    }
                    input.targetAddress = Address.createFromRawAddress(value);
                    break;
                }

                default: {
                    if (token.startsWith("-")) {
                        throw new Error(`Unknown option ${token}`);
                    }

                    // We'll use only first one.
                    if (!input.metalId) {
                        input.metalId = token;
                    }
                    break;
                }
            }
        }

        return input;
    };

    // Initializing CLI environment
    export const validateInput = async (input: Readonly<CommandlineInput>) => {
        if (!input.nodeUrl) {
            throw new Error("Node URL wasn't specified. [--node-url node_url] or NODE_URL is required.");
        }

        // We'll not announce any TXs this command.
        await initCliEnv(input.nodeUrl, 0);

        return validateMetalIdentifyInput(
            await validateStreamInput(input, !input.force)
        );
    };

    export const printUsage = () => {
        Logger.error(
            `Usages:\n` +
            `  With Metal ID          $ fetch [options] metal_id\n` +
            `  Account Metal          $ fetch [options] -k metadata_key\n` +
            `  Mosaic Metal           $ fetch [options] -m mosaic_id -k metadata_key\n` +
            `  Namespace Metal        $ fetch [options] -n namespace_name -k metadata_key\n` +
            `Options:\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  -h, --help             Show command line usage\n` +
            `  -k metadata_key,\n` +
            `  --key value            Specify metadata_key\n` +
            `  -m mosaic_id,\n` +
            `  --mosaic value         Specify mosaic_id and demand Mosaic Metal\n` +
            `  -n namespace_name,\n` +
            `  --namespace value      Specify namespace_name and demand Namespace Metal\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  --no-save              Don't save file (Only show summary)\n` +
            `  -o output_path,\n` +
            `  --out value            Specify output_path (default:[metal_id])\n` +
            `  --priv-key value       Specify signer's private_key\n` +
            `  -s public_key,\n` +
            `  --src-pub-key value    Specify source_account via public_key (default:signer)\n` +
            `  --src-addr value       Specify source_account via address (default:signer)\n` +
            `  -t public_key,\n` +
            `  --tgt-pub-key value    Specify target_account via public_key (default:signer)\n` +
            `  --tgt-addr value       Specify target_account via address (default:signer)\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private_key\n`
        );
    };

}

