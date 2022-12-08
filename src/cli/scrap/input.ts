import {Convert, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {initCliEnv, isValueOption, NodeInput} from "../common";
import fs from "fs";
import {VERSION} from "./version";
import {AccountsInput, validateAccountsInput} from "../accounts";
import {SymbolService} from "../../services";
import {Logger} from "../../libs";
import prompts from "prompts";
import {PACKAGE_VERSION} from "../../package_version";


export namespace ScrapInput {

    export interface CommandlineInput extends NodeInput, AccountsInput {
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
        outputPath?: string;
        type?: MetadataType;

        // Filled by validator
        additiveBytes?: Uint8Array;
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
                        throw new Error(`${token} must has additive (4 ascii chars) as a value.`);
                    }
                    input.additive = value;
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

                case "-i":
                case "--in": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has input_path as a value.`);
                    }
                    input.filePath = value;
                    break;
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
                        throw new Error(`${token} must has public_key as a value.`);
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
                        throw new Error(`${token} must has public_key as a value.`);
                    }
                    input.targetPublicKey = value;
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
    export const validateInput = async (_input: Readonly<CommandlineInput>) => {
        let input: CommandlineInput = { ..._input };
        if (input.feeRatio && (input.feeRatio > 1.0 || input.feeRatio < 0.0)) {
            throw new Error("[--fee-ratio value] must be 0.0 <= x <= 1.0")
        }

        await initCliEnv(input, input.feeRatio);

        if (input.filePath) {
            if (!fs.existsSync(input.filePath)) {
                throw new Error(`${input.filePath}: File not found.`);
            }
        } else if(!input.key && !input.metalId) {
            throw new Error(`[--key value] or [metal_id] is required.`)
        }

        if (input.outputPath && fs.existsSync(input.outputPath) && !input.force) {
            const decision = (await prompts({
                type: "confirm",
                name: "decision",
                message: `${input.outputPath}: Are you sure overwrite this?`,
                initial: false,
                stdout: process.stderr,
            })).decision;
            if (!decision) {
                throw new Error(`Canceled by user.`);
            }
        }

        if (input.additive) {
            if (!input.additive.match(/^[\x21-\x7e\s]{4}$/)) {
                throw new Error("[--additive value] must be 4 ascii chars.");
            }
            input.additiveBytes = Convert.utf8ToUint8(input.additive);
        }

        return validateAccountsInput(input, !input.force);
    };

    export const printUsage = () => {
        Logger.info(
            `Usages:\n` +
            `  With Metal ID          $ scrap [options] metal_id\n` +
            `  Account Metal          $ scrap [options] -k metadata_key\n` +
            `  Mosaic Metal           $ scrap [options] -m mosaic_id -k metadata_key\n` +
            `  Namespace Metal        $ scrap [options] -n namespace_name -k metadata_key\n` +
            `Options:\n` +
            `  --additive value       Specify additive with 4 ascii characters (e.g. "A123", default:0000)\n` +
            `  --cosigner private_key Specify multisig cosigner's private_key (You can set multiple)\n` +
            `  -e, --estimate         Enable estimation mode (No TXs announce)\n` +
            `  --fee-ratio value      Specify fee_ratio with decimal (0.0 ~ 1.0, default:0.0)\n` +
            `                         Higher ratio may get fast TX but higher cost\n` +
            `  -f, --force            Do not show any prompts\n` +
            `  -h, --help             Show command line usage\n` +
            `  -i input_path,\n` +
            `  --in value             Specify input_path\n` +
            `  -k metadata_key,\n` +
            `  --key value            Specify metadata_key\n` +
            `  -m mosaic_id,\n` +
            `  --mosaic value         Specify mosaic_id and demand Mosaic Metal\n` +
            `  -n namespace_name,\n` +
            `  --namespace value      Specify namespace_name and demand Namespace Metal\n` +
            `  --node-url node_url    Specify network node_url\n` +
            `  -o output_path.json,\n` +
            `  --out value            Specify JSON file output_path.json that will contain serialized TXs\n` +
            `  --parallels value      Max TXs for parallel announcing (default:10)\n` +
            `  --priv-key value       Specify signer's private_key\n` +
            `  -s public_key,\n` +
            `  --src-pub-key value    Specify source_account via public_key\n` +
            `  --src-priv-key value   Specify source_account via private_key\n` +
            `  -t public_key,\n` +
            `  --tgt-pub-key value    Specify target_account via public_key\n` +
            `  --tgt-priv-key value   Specify target_account via private_key\n` +
            `  --verbose              Show verbose logs\n` +
            `  --version              Show command version\n` +
            `Environment Variables:\n` +
            `  FEE_RATIO              Specify fee_ratio with decimal (0.0 ~ 1.0)\n` +
            `  NODE_URL               Specify network node_url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private_key\n`
        );
    };

    export const printVersion = () => {
        Logger.info(`Metal Scrap CLI version ${VERSION} (${PACKAGE_VERSION})\n`);
    };

}

