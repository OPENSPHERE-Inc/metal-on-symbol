import fs from "fs";
import prompts from "prompts";
import { MetadataType, MosaicId, NamespaceId, UInt64 } from "symbol-sdk";
import { Logger } from "../../libs";
import { PACKAGE_VERSION } from "../../package_version";
import { SymbolService } from "../../services";
import { AccountsInput, validateAccountsInput } from "../accounts";
import { deadlineMinHours, initCliEnv, isValueOption, NodeInput } from "../common";
import { VERSION } from "./version";


export namespace ScrapInput {

    export interface CommandlineInput extends NodeInput, AccountsInput {
        version: string;
        additive?: number;
        deadlineHours: number;
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
        requiredCosignatures?: number;
        type?: MetadataType;
        seal: number;
        sealComment?: string;
        text?: string;
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
            feeRatio: Number(process.env.FEE_RATIO || 0.35),
            deadlineHours: deadlineMinHours,
            seal: 2,
        };

        for (let i = 0; i < argv.length; i++) {
            const token = argv[i];
            switch (token) {
                case "--additive": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must be an number between 0 and 65535`);
                    }
                    input.additive = Number(value);
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

                case "--deadline": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has hours (integer) as a value.`);
                    }
                    input.deadlineHours = Math.floor(Number(value));
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

                case "--node-url": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has node_url as a value.`);
                    }

                    input.nodeUrl = value;
                    break;
                }

                case "--num-cosigs": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${value} must has number as a value.`);
                    }

                    input.requiredCosignatures = Math.floor(Number(value));
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

                case "--seal": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has seal level number as value.`);
                    }
                    input.seal = Math.floor(Number(value));
                    break;
                }
                case "-S0": {
                    input.seal = 0;
                    break;
                }
                case "-S1": {
                    input.seal = 1;
                    break;
                }
                case "-S2": {
                    input.seal = 2;
                    break;
                }
                case "-S3": {
                    input.seal = 3;
                    break;
                }
                case "--comment": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has seal comment as value.`);
                    }
                    input.sealComment = value;
                    break;
                }
                case "--text": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw new Error(`${token} must has text section payload as value.`);
                    }
                    input.text = value;
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
            if (!Number.isSafeInteger(input.additive) || input.additive < 0 || input.additive > 0xFFFF) {
                throw new Error("[--additive value] must be an number between 0 and 65535");
            }
        }
        if (input.deadlineHours < deadlineMinHours) {
            throw new Error(`[--deadline hours] must be ${deadlineMinHours} hours or longer.`);
        }
        if (input.requiredCosignatures !== undefined && input.requiredCosignatures === 0) {
            throw new Error("[--num-cosigs value] must not be zero.");
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
            `  --additive value       Specify additive with 0~65535 integer (e.g. 1234, default:0)\n` +
            `  --comment text         Specify Metal Seal comment.\n` +
            `  --cosigner private_key Specify multisig cosigner's private_key (You can set multiple)\n` +
            `  --deadline hours       Specify intermediate TX deadline in hours (default:5, must be 5 hours or longer)\n` +
            `  -e, --estimate         Enable estimation mode (No TXs announce)\n` +
            `  --fee-ratio value      Specify fee_ratio with decimal (0.0 ~ 1.0, default:0.35)\n` +
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
            `  --num-cosigs value     Specify number of required cosignatures for precise fee estimation\n` +
            `  -o output_path.json,\n` +
            `  --out value            Specify JSON file output_path.json that will contain intermediate TX\n` +
            `  --parallels value      Max TXs for parallel announcing (default:10)\n` +
            `  --priv-key value       Specify signer's private_key\n` +
            `  --seal level           Specify Metal Seal level. 0 means no seal. (default:2)\n` +
            `  -S0,-S1,-S2,-S3        Alias of --seal 0~3\n` +
            `  -s public_key,\n` +
            `  --src-pub-key value    Specify source_account via public_key\n` +
            `  --src-priv-key value   Specify source_account via private_key\n` +
            `  --text value           Specify text section payload (Override --seal and --comment option)\n` +
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

