import {Account, Address, PublicAccount} from "symbol-sdk";
import {SymbolService} from "../services";
import {Logger} from "../libs";
import prompts from "prompts";


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
    _input: Readonly<T>,
    showPrompt: boolean = true,
) => {
    let input: T = { ..._input };
    const { networkType } = await SymbolService.getNetwork();

    if (!input.signerPrivateKey && showPrompt) {
        input.signerPrivateKey = (await prompts({
            type: "password",
            name: "private_key",
            message: "Signer's Private Key?",
            stdout: process.stderr,
        })).private_key;
    }
    if (!input.signerPrivateKey) {
        throw new Error(
            "Signer's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
        );
    }
    input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
    Logger.info(`Signer Address is ${input.signer.address.plain()}`);


    if (input.sourcePublicKey) {
        input.sourceAccount = PublicAccount.createFromPublicKey(input.sourcePublicKey, networkType);
    }

    if (input.sourcePrivateKey) {
        input.sourceSigner = Account.createFromPrivateKey(input.sourcePrivateKey, networkType);
        if (input.sourceAccount && !input.sourceSigner.publicAccount.equals(input.sourceAccount)) {
            throw new Error(
                "Mismatched source account between public key and private key " +
                "(You don't need to specify public key)"
            );
        }
    }

    if (input.sourceAccount || input.sourceSigner) {
        Logger.info(`Source Address is ${(input.sourceAccount || input.sourceSigner)?.address.plain()}`)
    }

    if (input.targetPublicKey) {
        input.targetAccount = PublicAccount.createFromPublicKey(input.targetPublicKey, networkType);
    }

    if (input.targetPrivateKey) {
        input.targetSigner = Account.createFromPrivateKey(input.targetPrivateKey, networkType);
        if (input.targetAccount && !input.targetSigner.publicAccount.equals(input.targetAccount)) {
            throw new Error(
                "Mismatched target account between public key and private key " +
                "(You don't need to specify public key)"
            );
        }
    }

    if (input.targetAccount || input.targetSigner) {
        Logger.info(`Target Address is ${(input.targetAccount || input.targetSigner)?.address.plain()}`)
    }

    input.cosigners = input.cosignerPrivateKeys?.map(
        (privateKey) => {
            const cosigner = Account.createFromPrivateKey(privateKey, networkType)
            Logger.info(`Additional Cosigner Address is ${cosigner.address.plain()}`);
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

    // Filled by validator
    sourceAccount?: PublicAccount;
    targetAccount?: PublicAccount;
}

export const validateAddressesInput = async <T extends AddressesInput>(
    _input: Readonly<T>,
) => {
    let input: T = { ..._input };
    const { networkType } = await SymbolService.getNetwork();

    if (input.sourcePublicKey) {
        input.sourceAccount = PublicAccount.createFromPublicKey(input.sourcePublicKey, networkType);
        if (input.sourceAddress && !input.sourceAddress.equals(input.sourceAccount.address)) {
            throw new Error(
                "Mismatched source account between public key and address " +
                "(You don't need to specify public key)"
            );
        }
        input.sourceAddress = input.sourceAccount.address;
    }

    if (input.targetPublicKey) {
        input.targetAccount = PublicAccount.createFromPublicKey(input.targetPublicKey, networkType);
        if (input.targetAddress && !input.targetAddress.equals(input.targetAccount.address)) {
            throw new Error(
                "Mismatched target account between public key and address " +
                "(You don't need to specify public key)"
            );
        }
        input.targetAddress = input.targetAccount.address;
    }

    return input;
}