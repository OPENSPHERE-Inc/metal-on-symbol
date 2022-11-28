import {Account, MetadataType, MosaicId, NamespaceId, PublicAccount} from "symbol-sdk";
import fs from "fs";
import {initCliEnv, isValueOption, validateAccountsInput} from "../common";
import {VERSION} from "./version";


export interface CommandlineInput {
    version: string;

    additive?: string;
    checkCollision: boolean;
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
    signerPrivateKey?: string;
    sourcePrivateKey?: string;
    sourcePublicKey?: string;
    targetPrivateKey?: string;
    targetPublicKey?: string;
    type: MetadataType;
    verify: boolean;

    // Filled by validateInput
    signer?: Account;
    sourceAccount?: PublicAccount;
    sourceSigner?: Account;
    targetAccount?: PublicAccount;
    targetSigner?: Account;
}

export const parseInput = () => {
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

    for (let i = 2; i < process.argv.length; i++) {
        const token = process.argv[i];
        switch (token) {
            case "--additive": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has additive code (4 digits) as a value.`);
                }
                input.additive = value;
                break;
            }

            case "-c":
            case "--check-collision": {
                input.checkCollision = true;
                break;
            }

            case "-e":
            case "--estimate": {
                input.estimate = true;
                break;
            }

            case "--fee-ratio": {
                const value = process.argv[++i];
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

            case "-m":
            case "--mosaic": {
                const value = process.argv[++i];
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
                const value = process.argv[++i];
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

            case "--node-url": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${value} must has node url as a value.`);
                }

                input.nodeUrl = value;
                break;
            }

            case "-o":
            case "--out": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has output file path as a value.`);
                }
                input.outputPath = value;
                break;
            }

            case "--parallels": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has number as a value.`);
                }
                input.maxParallels = Number(value);
                break;
            }

            case "--priv-key": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has signer's private key as a value.`);
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
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has source's private key as a value.`);
                }
                input.sourcePrivateKey = value;
                break;
            }

            case "-s":
            case "--src-pub-key": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has source's public key as a value.`);
                }
                input.sourcePublicKey = value;
                break;
            }

            case "--tgt-priv-key": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has target's private key as a value.`);
                }
                input.targetPrivateKey = value;
                break;
            }

            case "-t":
            case "--tgt-pub-key": {
                const value = process.argv[++i];
                if (!isValueOption(value)) {
                    throw Error(`${token} must has target's public key as a value.`);
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
                    throw Error(`Unknown option ${token}`);
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
        throw Error("Node URL wasn't specified. [--node-url value] or NODE_URL is required.");
    }
    if (input.feeRatio && (input.feeRatio > 1.0 || input.feeRatio < 0.0)) {
        throw Error("[--fee-ratio value] must be 0.0 <= x <= 1.0")
    }

    await initCliEnv(input.nodeUrl, input.feeRatio);

    if (!input.filePath) {
        throw Error("[input_file] wasn't specified.")
    }
    if (!fs.existsSync(input.filePath)) {
        throw Error(`${input.filePath}: not found.`);
    }
    if (input.additive && !input.additive.match(/^\d{4}$/)) {
        throw Error("[--additive value] must be 4 ascii chars.");
    }

    return validateAccountsInput(input);
};

export const printUsage = () => {
    console.error(
        `Usage: forge [options] input_file\n` +
        `Options:\n` +
        `  --additive value       Specify additive with 4 ascii characters (e.g. "A123")\n` +
        `  -c, --check-collision  Check key collision before announce (Also estimation mode allowed)\n` +
        `  -e, --estimate         Enable estimation mode (No TXs announce)\n` +
        `  --fee-ratio value      Specify fee ratio with decimal (0.0 ~ 1.0, default:0.0)\n` +
        `                         Higher ratio may get fast TX but higher cost\n` +
        `  -f, --force            Do not show prompt before announcing\n` +
        `  -h, --help             Show command line usage\n` +
        `  -m mosaic_id,\n` +
        `  --mosaic value         Enable mosaic metal mode and specify mosaic ID\n` +
        `  -n namespace_name,\n` +
        `  --namespace value      Enable namespace metal mode and specify namespace name\n` +
        `  --node-url node_url    Specify network node url\n` +
        `  -o output_file,\n` +
        `  --out value            Specify output json file path that will contain aggregate TXs\n` +
        `  --parallels value      Max parallels announcing TXs (default:10)\n` +
        `  --priv-key value       Specify signer's private key\n` +
        `  -s public_key,\n` +
        `  --src-pub-key value    Specify source account via public key\n` +
        `  --src-priv-key value   Specify source account via private key\n` +
        `  -t public_key,\n` +
        `  --tgt-pub-key value    Specify target account via public key\n` +
        `  --tgt-priv-key value   Specify target account via private key\n` +
        `  -v, --verify           Invoke verify after announce (Ignore on estimation mode)\n` +
        `Environment Variables:\n` +
        `  FEE_RATIO              Specify fee ratio with decimal (0.0 ~ 1.0)\n` +
        `  NODE_URL               Specify network node url\n` +
        `  SIGNER_PRIVATE_KEY     Specify signer's private key`
    );
};