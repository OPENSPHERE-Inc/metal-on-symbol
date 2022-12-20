import {Account, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {AddressesInput, validateAddressesInput} from "./accounts";
import {Logger} from "../libs";
import {symbolService} from "./common";


export interface MetalIdentifyInput extends AddressesInput {
    type: MetadataType;
    key?: UInt64;
    metalId?: string;
    mosaicId?: MosaicId;
    namespaceId?: NamespaceId;
    signerPrivateKey?: string;

    // Filled by validateMetalIdentify
    signerAccount?: Account;
}

export const validateMetalIdentifyInput = async <T extends MetalIdentifyInput>(_input: Readonly<T>) => {
    let input: T = await validateAddressesInput(_input);

    const { networkType } = await symbolService.getNetwork();

    if (input.signerPrivateKey) {
        input.signerAccount = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
        Logger.info(`Singer Address is ${input.signerAccount.address.plain()}`);
    }
    if (!input.metalId && !input.signerAccount && !input.sourceAddress) {
        throw new Error(
            "[source_account] must be specified via [--src-pub-key value], " +
            "[--src-addr value] or [--priv-key value]"
        );
    }
    if (!input.metalId && !input.signerAccount && !input.targetAddress) {
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