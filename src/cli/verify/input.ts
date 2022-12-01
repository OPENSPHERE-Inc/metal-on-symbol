import {Account, Address, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {initCliEnv, isValueOption} from "../common";
import {SymbolService} from "../../services/symbol";
import fs from "fs";
import {VERSION} from "./version";
import {AddressesInput, validateAddressesInput} from "../account";


export namespace VerifyInput {

    export interface CommandlineInput extends AddressesInput {
        version: string;
        filePath?: string;
        key?: UInt64;
        metalId?: string;
        mosaicId?: MosaicId;
        namespaceId?: NamespaceId;
        nodeUrl?: string,
        signerPrivateKey?: string;
        type: MetadataType;

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
                        throw Error(`${token} must has metal_key (HEX) as a value.`);
                    }
                    input.key = UInt64.fromHex(value);
                    break;
                }

                case "-m":
                case "--mosaic": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${value} must has mosaic_id as a value.`);
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
                        throw Error(`${token} must has namespace_name as a value.`);
                    }
                    if (input.type !== MetadataType.Account) {
                        throw Error("You cannot specify --mosaic and --namespace more than once, or both.")
                    }

                    input.type = MetadataType.Namespace;
                    input.namespaceId = SymbolService.createNamespaceId(value);
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

                case "-s":
                case "--src-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has public_key as a value.`);
                    }
                    input.sourcePublicKey = value;
                    break;
                }

                case "--src-addr": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has address as a value.`);
                    }
                    input.sourceAddress = Address.createFromRawAddress(value);
                    break;
                }

                case "-t":
                case "--tgt-pub-key": {
                    const value = argv[++i];
                    if (!isValueOption(value)) {
                        throw Error(`${token} must has public_key as a value.`);
                    }
                    input.targetPublicKey = value;
                    break;
                }

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
        if (!input.metalId && !input.signer && !input.sourceAddress && !input.sourcePublicKey) {
            throw Error("[source_account] must be specified via [--src-pub-key value], [--src-addr value] or [--priv-key value]");
        }
        if (!input.metalId && !input.signer && !input.targetAddress && !input.targetPublicKey) {
            throw Error("[target_account] must be specified via [--tgt-pub-key value], [--tgt-addr value] or [--priv-key value]");
        }
        if (!input.metalId && !input.key) {
            throw Error("[metadata_key] must be specified via [--key value]");
        }

        return validateAddressesInput(input);
    };

    export const printUsage = () => {
        console.error(
            `  With Metal ID          $ verify [options] metal_id input_file\n` +
            `  Account Metal          $ verify [options] -k metadata_key input_file\n` +
            `  Mosaic Metal           $ verify [options] -m mosaic_id -k metadata_key input_file\n` +
            `  Namespace Metal        $ verify [options] -n namespace_name -k metadata_key input_file\n` +
            `Options:\n` +
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

