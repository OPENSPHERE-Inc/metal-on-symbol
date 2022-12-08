import {Account, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {AddressesInput, validateAddressesInput} from "./accounts";
import {SymbolService} from "../services";
import {Logger} from "../libs";


export interface MetalIdentifyInput extends AddressesInput {
    type: MetadataType;
    key?: UInt64;
    metalId?: string;
    mosaicId?: MosaicId;
    namespaceId?: NamespaceId;
    signerPrivateKey?: string;

    // Filled by validateMetalIdentify
    signer?: Account;
}

export const validateMetalIdentifyInput = async <T extends MetalIdentifyInput>(_input: Readonly<T>) => {
    let input: T = await validateAddressesInput(_input);

    const { networkType } = await SymbolService.getNetwork();

    if (input.signerPrivateKey) {
        input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
        Logger.info(`Singer Address is ${input.signer.address.plain()}`);
    }
    if (!input.metalId && !input.signer && !input.sourceAddress) {
        throw new Error(
            "[source_account] must be specified via [--src-pub-key value], " +
            "[--src-addr value] or [--priv-key value]"
        );
    }
    if (!input.metalId && !input.signer && !input.targetAddress) {
        throw new Error(
            "[target_account] must be specified via [--tgt-pub-key value], " +
            "[--tgt-addr value] or [--priv-key value]"
        );
    }
    if (!input.metalId && !input.key) {
        throw new Error("[metadata_key] must be specified via [--key value]");
    }

    return input;
};