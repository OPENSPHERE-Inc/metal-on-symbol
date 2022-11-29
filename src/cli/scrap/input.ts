import {MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {initCliEnv, isValueOption} from "../common";
import fs from "fs";
import {VERSION} from "./version";
import {AccountsInput, validateAccountsInput} from "../account";


export namespace ScrapInput {

    export interface CommandlineInput extends AccountsInput {
        version: string;
        additive?: string;
        estimate: boolean;
        feeRatio: number;
        filePath?: string;
        force: boolean;
        key?: UInt64;
        maxParallels: number;
        metalId?: string;
        mosaicId?: MosaicId;
        namespaceId?: NamespaceId;
        nodeUrl?: string,
        outputPath?: string;
        type?: MetadataType;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            nodeUrl: process.env.NODE_URL,
            signerPrivateKey: process.env.SIGNER_PRIVATE_KEY,
            type: MetadataType.Account,
            estimate: false,
            maxParallels: 10,
            force: false,
            feeRatio: Number(process.env.FEE_RATIO || 0),
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "--additive": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has additive code (4 digits) as a value.`);
                    }
                    input.additive = value;
                    break;
                }

                case "--cosigner": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has cosigner's private key as a value.`);
                    }
                    input.cosignerPrivateKeys = [ ...(input.cosignerPrivateKeys || []), ...value ];
                    break;
                }

                case "-e":
                case "--estimate": {
                    input.estimate = true;
                    break;
                }

                case "--fee-ratio": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has fee ratio (decimal) as a value.`);
                    }
                    input.feeRatio = Number(value);
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

                case "-i":
                case "--in": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has input file path as a value.`);
                    }
                    input.filePath = value;
                    break;
                }

                case "-k":
                case "--key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has metal key (HEX) as a value.`);
                    }
                    input.key = UInt64.fromHex(value);
                    break;
                }

                case "-m":
                case "--mosaic": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${value} must has mosaic id as a value.`);
                    }
                    if (input.type !== MetadataType.Account) {
                        throw Error("You cannot specify --mosaic and --namespace more than once, or both.")
                    }

                    input.type = MetadataType.Mosaic;
                    input.mosaicId = new MosaicId(value);
                    break;
                }

                case "-n":
                case "--namespace": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has namespace name as a value.`);
                    }
                    if (input.type !== MetadataType.Account) {
                        throw Error("You cannot specify --mosaic and --namespace more than once, or both.")
                    }

                    input.type = MetadataType.Namespace;
                    input.namespaceId = new NamespaceId(value);
                    break;
                }

                case "-o":
                case "--out": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has output file path as a value.`);
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
                        throw Error(`${token} must has signer's private key as a value.`);
                    }
                    input.signerPrivateKey = value;
                    break;
                }

                case "--src-priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has source's private key as a value.`);
                    }
                    input.sourcePrivateKey = value;
                    break;
                }

                case "-s":
                case "--src-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has public key as a value.`);
                    }
                    input.sourcePublicKey = value;
                    break;
                }

                case "--tgt-priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has target's private key as a value.`);
                    }
                    input.targetPrivateKey = value;
                    break;
                }

                case "-t":
                case "--tgt-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has public key as a value.`);
                    }
                    input.targetPublicKey = value;
                    break;
                }

                default: {
                    if (token.startsWith("-")) {
                        throw Error(`Unknown option ${token}`);
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
    export const validateInput = async (input: CommandlineInput) => {
        if (!input.nodeUrl) {
            throw Error("Node URL wasn't specified. [--node-url node_url] or NODE_URL is required.");
        }

        await initCliEnv(input.nodeUrl, input.feeRatio);

        if (input.filePath) {
            if (!fs.existsSync(input.filePath)) {
                throw Error(`${input.filePath}: File not found.`);
            }
        } else if(!input.key && !input.metalId) {
            throw Error(`[--key value] or [metal_id] is required.`)
        }

        return validateAccountsInput(input);
    };

    export const printUsage = () => {
        console.error(
            `Usages:\n` +
            `  Specify via metal ID   $ scrap [options] metal_id\n` +
            `  Account metal          $ scrap [options] -k metadata_key\n` +
            `  Mosaic metal           $ scrap [options] -m mosaic_id -k metadata_key\n` +
            `  Namespace metal        $ scrap [options] -n namespace_name -k metadata_key\n` +
            `Options:\n` +
            `  --additive value       Specify additive with 4 ascii characters (e.g. "A123")\n` +
            `  --cosigner private_key Specify multisig cosigner's private key (You can set multiple)\n` +
            `  -e, --estimate         Enable estimation mode (No TXs announce)\n` +
            `  --fee-ratio value      Specify fee ratio with decimal (0.0 ~ 1.0, default:0.0)\n` +
            `                         Higher ratio may get fast TX but higher cost\n` +
            `  -f, --force            Do not show prompt before announcing\n` +
            `  -h, --help             Show command line usage\n` +
            `  -i input_file,\n` +
            `  --in value             Specify input file path\n` +
            `  -k metadata_key,\n` +
            `  --key value            Specify metadata key\n` +
            `  -m mosaic_id,\n` +
            `  --mosaic value         Enable mosaic metal mode and specify mosaic ID\n` +
            `  -n namespace_name,\n` +
            `  --namespace value      Enable namespace metal mode and specify namespace name\n` +
            `  --node-url node_url    Specify network node url\n` +
            `  -o output_file.json,\n` +
            `  --out value            Specify output JSON file path that will contain serialized TXs\n` +
            `  --priv-key value       Specify signer's private key\n` +
            `  -s public_key,\n` +
            `  --src-pub-key value    Specify source account via public key\n` +
            `  --src-priv-key value   Specify source account via private key\n` +
            `  -t public_key,\n` +
            `  --tgt-pub-key value    Specify target account via public key\n` +
            `  --tgt-priv-key value   Specify target account via private key\n` +
            `Environment Variables:\n` +
            `  FEE_RATIO              Specify fee ratio with decimal (0.0 ~ 1.0)\n` +
            `  NODE_URL               Specify network node url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private key`
        );
    };

}

