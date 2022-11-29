import {Account, Address, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {initCliEnv, isValueOption} from "../common";
import {SymbolService} from "../../services/symbol";
import fs from "fs";
import {VERSION} from "./version";


export namespace VerifyInput {

    export interface CommandlineInput {
        version: string;
        filePath?: string;
        key?: UInt64;
        metalId?: string;
        mosaicId?: MosaicId;
        namespaceId?: NamespaceId;
        nodeUrl?: string,
        signerPrivateKey?: string;
        sourceAddress?: Address;
        targetAddress?: Address;
        type?: MetadataType;

        // Filled by validateInput
        signer?: Account;
    }

    export const parseInput = (argv: string[]) => {
        const input: CommandlineInput = {
            version: VERSION,
            nodeUrl: process.env.NODE_URL,
            signerPrivateKey: process.env.SIGNER_PRIVATE_KEY,
            type: MetadataType.Account,
        };

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

                case "--priv-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has signer's private key as a value.`);
                    }
                    input.signerPrivateKey = value;
                    break;
                }

                case "-s":
                case "--src-addr": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has address as a value.`);
                    }
                    input.sourceAddress = Address.createFromRawAddress(value);
                    break;
                }

                case "-t":
                case "--tgt-addr": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has address as a value.`);
                    }
                    input.targetAddress = Address.createFromRawAddress(value);
                    break;
                }

                default: {
                    if (token.startsWith("-")) {
                        throw Error(`Unknown option ${token}`);
                    }

                    if (!input.filePath) {
                        // [file_path]
                        input.filePath = token;
                    } else if (!input.metalId) {
                        // [metal_id] [file_path]
                        input.metalId = input.filePath;
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
            throw Error("Node URL wasn't specified. [--node-url node_url] or NODE_URL is required.");
        }

        // We'll not announce any TXs this command.
        await initCliEnv(input.nodeUrl, 0);

        const { networkType } = await SymbolService.getNetwork();

        if (!input.filePath) {
            throw Error("[input_file] wasn't specified.")
        }
        if (!fs.existsSync(input.filePath)) {
            throw Error(`${input.filePath}: File not found.`);
        }
        if (input.signerPrivateKey) {
            input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
        }
        if (!input.metalId && !input.signer && !input.sourceAddress) {
            throw Error("[source_address] must be specified via [--src-addr value] or [--priv-key value]");
        }
        if (!input.metalId && !input.key) {
            throw Error("[metadata_key] must be specified via [--key value]");
        }

        return input;
    };

    export const printUsage = () => {
        console.error(
            `  Specify via metal ID   $ verify [options] metal_id input_file\n` +
            `  Account metal          $ verify [options] -k metadata_key input_file\n` +
            `  Mosaic metal           $ verify [options] -m mosaic_id -k metadata_key input_file\n` +
            `  Namespace metal        $ verify [options] -n namespace_name -k metadata_key input_file\n` +
            `Options:\n` +
            `  -h, --help             Show command line usage\n` +
            `  -k metadata_key,\n` +
            `  --key value            Specify metadata key\n` +
            `  -m mosaic_id,\n` +
            `  --mosaic value         Enable mosaic metal mode and specify mosaic ID\n` +
            `  -n namespace_name,\n` +
            `  --namespace value      Enable namespace metal mode and specify namespace name\n` +
            `  --node-url node_url    Specify network node url\n` +
            `  --priv-key value       Specify signer's private key\n` +
            `  -s address,\n` +
            `  --src-addr value       Specify source account address\n` +
            `  -t address,\n` +
            `  --tgt-addr value       Specify target account address\n` +
            `Environment Variables:\n` +
            `  NODE_URL               Specify network node url\n` +
            `  SIGNER_PRIVATE_KEY     Specify signer's private key`
        );
    };

}

