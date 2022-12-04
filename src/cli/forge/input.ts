import {Convert, MetadataType, MosaicId, NamespaceId,} from "symbol-sdk";
import fs from "fs";
import {initCliEnv, isValueOption} from "../common";
import {VERSION} from "./version";
import {AccountsInput, validateAccountsInput} from "../accounts";
import {SymbolService} from "../../services";
import PromptSync from "prompt-sync";


export namespace ForgeInput {

    const prompt = PromptSync();

    export interface CommandlineInput extends AccountsInput {
        version: string;
        additive?: string;
        checkCollision: boolean;
        cosignerPrivateKeys?: string[];
        estimate: boolean;
        feeRatio: number;
        filePath?: string;
        force: boolean;
        maxParallels: number;
        mosaicId?: MosaicId;
        namespaceId?: NamespaceId;
        nodeUrl?: string;
        outputPath?: string;
        recover: boolean;
        type: MetadataType;
        verify: boolean;

        // Filled by validator
        additiveBytes?: Uint8Array;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            estimate: false,
            type: MetadataType.Account,
            verify: false,
            checkCollision: false,
            maxParallels: 10,
            force: false,
            feeRatio: Number(process.env.FEE_RATIO || 0),
            nodeUrl: process.env.NODE_URL,
            signerPrivateKey: process.env.SIGNER_PRIVATE_KEY,
            recover: false,
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "--additive": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has additive (4 ascii chars) as a value.`);
                    }
                    input.additive = value;
                    break;
                }

                case "-c":
                case "--check-collision": {
                    input.checkCollision = true;
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

                case "-e":
                case "--estimate": {
                    input.estimate = true;
                    break;
                }

                case "--fee-ratio": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has fee_ratio (decimal) as a value.`);
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

                case "-r":
                case "--recover": {
                    input.recover = true;
                    break;
                }

                case "--src-priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has source's private_key as a value.`);
                    }
                    input.sourcePrivateKey = value;
                    break;
                }

                case "-s":
                case "--src-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has source's public_key as a value.`);
                    }
                    input.sourcePublicKey = value;
                    break;
                }

                case "--tgt-priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has target's private_key as a value.`);
                    }
                    input.targetPrivateKey = value;
                    break;
                }

                case "-t":
                case "--tgt-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has target's public_key as a value.`);
                    }
                    input.targetPublicKey = value;
                    break;
                }

                case "-v":
                case "--verify": {
                    input.verify = true;
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
    export const validateInput = async (input: CommandlineInput) => {
        if (!input.nodeUrl) {
            throw new Error("Node URL wasn't specified. [--node-url value] or NODE_URL is required.");
        }
        if (input.feeRatio && (input.feeRatio > 1.0 || input.feeRatio < 0.0)) {
            throw new Error("[--fee-ratio value] must be 0.0 <= x <= 1.0")
        }

        await initCliEnv(input.nodeUrl, input.feeRatio);

        if (!input.filePath) {
            throw new Error("[input_file] wasn't specified.")
        }
        if (!fs.existsSync(input.filePath)) {
            throw new Error(`${input.filePath}: File not found.`);
        }

        if (input.outputPath && !input.force && fs.existsSync(input.outputPath)) {
            if (prompt(`${input.outputPath}: Are you sure overwrite this [y/(n)]? `).toLowerCase() !== "y") {
                throw new Error(`Canceled by user.`);
            }
        }

        if (input.additive) {
            if (!input.additive.match(/^[\x21-\x7e\s]{4}$/)) {
                throw new Error("[--additive value] must be 4 ascii chars.");
            }
            input.additiveBytes = Convert.utf8ToUint8(input.additive);
        }

        return validateAccountsInput(input, input.force);
    };

    export const printUsage = () => {
        console.error(
            `Usage: forge [options] input_file\n` +
            `Options:\n` +
            `  --additive value       Specify additive with 4 ascii characters (e.g. "A123")\n` +
            `  -c, --check-collision  Check key collision before announce (Also estimation mode allowed)\n` +
            `  --cosigner private_key Specify multisig cosigner's private_key (You can set multiple)\n` +
            `  -e, --estimate         Enable estimation mode (No TXs announce)\n` +
            `  --fee-ratio value      Specify fee_ratio with decimal (0.0 ~ 1.0, default:0.0)\n` +
            `                         Higher ratio may get fast TX but higher cost\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  -h, --help             Show command line usage\n` +
            `  -m mosaic_id,\n` +
            `  --mosaic value         Specify mosaic_id and demand Mosaic Metal\n` +
            `  -n namespace_name,\n` +
            `  --namespace value      Specify namespace_name and demand Namespace Metal\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_file.json,\n` +
            `  --out value            Specify JSON file output_path that will contain serialized TXs\n` +
            `  --parallels value      Max TXs for parallel announcing (default:10)\n` +
            `  --priv-key value       Specify signer's private_key\n` +
            `  -r, --recover          Announce only lost chunks for recovery\n` +
            `  -s public_key,\n` +
            `  --src-pub-key value    Specify source_account via public_key\n` +
            `  --src-priv-key value   Specify source_account via private_key\n` +
            `  -t public_key,\n` +
            `  --tgt-pub-key value    Specify target_account via public_key\n` +
            `  --tgt-priv-key value   Specify target_account via private_key\n` +
            `  -v, --verify           Invoke verify after announce (Ignore on estimation mode)\n` +
            `Environment Variables:\n` +
            `  FEE_RATIO              Specify fee_ratio with decimal (0.0 ~ 1.0)\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private_key\n`
        );
    };

}

