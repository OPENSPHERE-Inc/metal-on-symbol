import {Account, MetadataType, MosaicId, NamespaceId, UInt64} from "symbol-sdk";
import {AddressesInput, validateAddressesInput} from "./account";
import {SymbolService} from "../services/symbol";


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

export const validateMetalIdentifyInput = async <T extends MetalIdentifyInput>(input: T) => {
    const addressesInput = await validateAddressesInput(input);

    const { networkType } = await SymbolService.getNetwork();

    if (addressesInput.signerPrivateKey) {
        addressesInput.signer = Account.createFromPrivateKey(addressesInput.signerPrivateKey, networkType);
        console.log(`Singer Address is ${addressesInput.signer.address.plain()}`);
    }
    if (!addressesInput.metalId && !addressesInput.signer && !addressesInput.sourceAddress) {
        throw Error("[source_account] must be specified via [--src-pub-key value], [--src-addr value] or [--priv-key value]");
    }
    if (!addressesInput.metalId && !addressesInput.signer && !addressesInput.targetAddress) {
        throw Error("[target_account] must be specified via [--tgt-pub-key value], [--tgt-addr value] or [--priv-key value]");
    }
    if (!addressesInput.metalId && !addressesInput.key) {
        throw Error("[metadata_key] must be specified via [--key value]");
    }

    return addressesInput;
};