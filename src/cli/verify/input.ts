import {Address, MetadataType, MosaicId, UInt64} from "symbol-sdk";
import {initCliEnv, isValueOption, NodeInput} from "../common";
import {SymbolService} from "../../services";
import {VERSION} from "./version";
import {MetalIdentifyInput, validateMetalIdentifyInput} from "../metal_id";
import {Logger} from "../../libs";
import {StreamInput, validateStreamInput} from "../stream";


export namespace VerifyInput {

    export interface CommandlineInput extends NodeInput, MetalIdentifyInput, StreamInput {
        version: string;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            nodeUrl: process.env.NODE_URL,
            signerPrivateKey: process.env.SIGNER_PRIVATE_KEY,
            type: MetadataType.Account,
        };

        const paths = new Array<string>();

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "-h":
                case "--help": {
                    throw "help";
                }

                case "-k":
                case "--key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has metal_key (HEX) as a value.`);
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

                    paths.push(token);
                    break;
                }
            }
        }

        if (!input.key) {
            // [metal_id] [input_path]
            input.metalId = paths[0];
            input.filePath = paths[1];
        } else {
            // [input_path]
            input.filePath = paths[0];
        }

        return input;
    };

    // Initializing CLI environment
    export const validateInput = async (input: Readonly<CommandlineInput>) => {
        // We'll not announce any TXs this command.
        await initCliEnv(input, 0);

        return validateMetalIdentifyInput(
            await validateStreamInput(input, true)
        );
    };

    export const printUsage = () => {
        Logger.error(
            `  With Metal ID          $ verify [options] metal_id [input_path]\n` +
            `  Account Metal          $ verify [options] -k metadata_key [input_path]\n` +
            `  Mosaic Metal           $ verify [options] -m mosaic_id -k metadata_key [input_path]\n` +
            `  Namespace Metal        $ verify [options] -n namespace_name -k metadata_key [input_path]\n` +
            `Options:\n` +
            `  input_path             Specify input_path of payload file (default:stdin)\n` +
            `  -h, --help             Show command line usage\n` +
            `  -k metadata_key,\n` +
            `  --key value            Specify metadata_key\n` +
            `  -m mosaic_id,\n` +
            `  --mosaic value         Specify mosaic_id and demand Mosaic Metal\n` +
            `  -n namespace_name,\n` +
            `  --namespace value      Specify namespace_name and demand Namespace Metal\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  --priv-key value       Specify signer's private_key\n` +
            `  -s public_key,\n` +
            `  --src-pub-key value    Specify source_account via public_key\n` +
            `  --src-addr value       Specify source_account via address\n` +
            `  -t public_key,\n` +
            `  --tgt-pub-key value    Specify target_account via public_key\n` +
            `  --tgt-addr value       Specify target_account via address\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private_key\n`
        );
    };

}

