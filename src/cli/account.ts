import {Account, Address, PublicAccount} from "symbol-sdk";
import {SymbolService} from "../services/symbol";
import PromptSync from "prompt-sync";


const prompt = PromptSync();

export interface AccountsInput {
    cosignerPrivateKeys?: string[];
    signerPrivateKey?: string;
    sourcePublicKey?: string;
    sourcePrivateKey?: string;
    targetPublicKey?: string;
    targetPrivateKey?: string;
    cosigners?: Account[];
    signer?: Account;
    sourceAccount?: PublicAccount;
    sourceSigner?: Account;
    targetAccount?: PublicAccount;
    targetSigner?: Account;
}

export const validateAccountsInput = async <T extends AccountsInput>(
    input: T,
    noPrompt: boolean = false,
) => {
    const { networkType } = await SymbolService.getNetwork();

    if (!input.signerPrivateKey && !noPrompt) {
        input.signerPrivateKey = prompt("Signer Private Key? ", "", { echo: "*" });
    }
    if (!input.signerPrivateKey) {
        throw Error(
            "Signer's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
        );
    }
    input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
    console.log(`Signer Address is ${input.signer.address.plain()}`);


    if (input.sourcePublicKey) {
        input.sourceAccount = PublicAccount.createFromPublicKey(input.sourcePublicKey, networkType);
    }

    if (input.sourcePrivateKey) {
        input.sourceSigner = Account.createFromPrivateKey(input.sourcePrivateKey, networkType);
        if (input.sourceAccount && !input.sourceSigner.publicAccount.equals(input.sourceAccount)) {
            throw Error(
                "Mismatched source account between public key and private key " +
                "(You don't need to specify public key)"
            );
        }
    }

    if (input.sourceAccount || input.sourceSigner) {
        console.log(`Source Address is ${(input.sourceAccount || input.sourceSigner)?.address.plain()}`)
    }

    if (input.targetPublicKey) {
        input.targetAccount = PublicAccount.createFromPublicKey(input.targetPublicKey, networkType);
    }

    if (input.targetPrivateKey) {
        input.targetSigner = Account.createFromPrivateKey(input.targetPrivateKey, networkType);
        if (input.targetAccount && !input.targetSigner.publicAccount.equals(input.targetAccount)) {
            throw Error(
                "Mismatched target account between public key and private key " +
                "(You don't need to specify public key)"
            );
        }
    }

    if (input.targetAccount || input.targetSigner) {
        console.log(`Target Address is ${(input.targetAccount || input.targetSigner)?.address.plain()}`)
    }

    input.cosigners = input.cosignerPrivateKeys?.map(
        (privateKey) => {
            const cosigner = Account.createFromPrivateKey(privateKey, networkType)
            console.log(`Additional Cosigner Address is ${cosigner.address.plain()}`);
            return cosigner;
        }
    );

    return input;
};

export interface AddressesInput {
    sourceAddress?: Address;
    sourcePublicKey?: string;
    targetAddress?: Address;
    targetPublicKey?: string;
}

export const validateAddressesInput = async <T extends AddressesInput>(
    input: T,
) => {
    const { networkType } = await SymbolService.getNetwork();

    if (input.sourcePublicKey) {
        const sourceAddress = Address.createFromPublicKey(input.sourcePublicKey, networkType);
        if (input.sourceAddress && !input.sourceAddress.equals(sourceAddress)) {
            throw Error(
                "Mismatched source account between public key and address " +
                "(You don't need to specify public key)"
            );
        }
        input.sourceAddress = sourceAddress;
    }

    if (input.targetPublicKey) {
        const targetAddress = Address.createFromPublicKey(input.targetPublicKey, networkType);
        if (input.targetAddress && !input.targetAddress.equals(targetAddress)) {
            throw Error(
                "Mismatched target account between public key and address " +
                "(You don't need to specify public key)"
            );
        }
        input.targetAddress = targetAddress;
    }

    return input;
}