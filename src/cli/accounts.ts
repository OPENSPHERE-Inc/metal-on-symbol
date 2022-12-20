import {Account, Address, PublicAccount} from "symbol-sdk";
import {Logger} from "../libs";
import prompts from "prompts";
import {symbolService} from "./common";


export interface AccountsInput {
    cosignerPrivateKeys?: string[];
    signerPrivateKey?: string;
    sourcePublicKey?: string;
    sourcePrivateKey?: string;
    targetPublicKey?: string;
    targetPrivateKey?: string;
    cosignerAccounts?: Account[];
    signerAccount?: Account;
    sourcePubAccount?: PublicAccount;
    sourceSignerAccount?: Account;
    targetPubAccount?: PublicAccount;
    targetSignerAccount?: Account;
}

export const validateAccountsInput = async <T extends AccountsInput>(
    _input: Readonly<T>,
    showPrompt: boolean = true,
) => {
    let input: T = { ..._input };
    const { networkType } = await symbolService.getNetwork();

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
    input.signerAccount = Account.createFromPrivateKey(input.signerPrivateKey, networkType);
    Logger.info(`Signer Address is ${input.signerAccount.address.plain()}`);


    if (input.sourcePublicKey) {
        input.sourcePubAccount = PublicAccount.createFromPublicKey(input.sourcePublicKey, networkType);
    }

    if (input.sourcePrivateKey) {
        input.sourceSignerAccount = Account.createFromPrivateKey(input.sourcePrivateKey, networkType);
        if (input.sourcePubAccount && !input.sourceSignerAccount.publicAccount.equals(input.sourcePubAccount)) {
            throw new Error(
                "Mismatched source account between public key and private key " +
                "(You don't need to specify public key)"
            );
        }
    }

    if (input.sourcePubAccount || input.sourceSignerAccount) {
        Logger.info(`Source Address is ${(input.sourcePubAccount || input.sourceSignerAccount)?.address.plain()}`)
    }

    if (input.targetPublicKey) {
        input.targetPubAccount = PublicAccount.createFromPublicKey(input.targetPublicKey, networkType);
    }

    if (input.targetPrivateKey) {
        input.targetSignerAccount = Account.createFromPrivateKey(input.targetPrivateKey, networkType);
        if (input.targetPubAccount && !input.targetSignerAccount.publicAccount.equals(input.targetPubAccount)) {
            throw new Error(
                "Mismatched target account between public key and private key " +
                "(You don't need to specify public key)"
            );
        }
    }

    if (input.targetPubAccount || input.targetSignerAccount) {
        Logger.info(`Target Address is ${(input.targetPubAccount || input.targetSignerAccount)?.address.plain()}`)
    }

    input.cosignerAccounts = input.cosignerPrivateKeys?.map(
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
    sourcePubAccount?: PublicAccount;
    targetPubAccount?: PublicAccount;
}

export const validateAddressesInput = async <T extends AddressesInput>(
    _input: Readonly<T>,
) => {
    let input: T = { ..._input };
    const { networkType } = await symbolService.getNetwork();

    if (input.sourcePublicKey) {
        input.sourcePubAccount = PublicAccount.createFromPublicKey(input.sourcePublicKey, networkType);
        if (input.sourceAddress && !input.sourceAddress.equals(input.sourcePubAccount.address)) {
            throw new Error(
                "Mismatched source account between public key and address " +
                "(You don't need to specify public key)"
            );
        }
        input.sourceAddress = input.sourcePubAccount.address;
    }

    if (input.targetPublicKey) {
        input.targetPubAccount = PublicAccount.createFromPublicKey(input.targetPublicKey, networkType);
        if (input.targetAddress && !input.targetAddress.equals(input.targetPubAccount.address)) {
            throw new Error(
                "Mismatched target account between public key and address " +
                "(You don't need to specify public key)"
            );
        }
        input.targetAddress = input.targetPubAccount.address;
    }

    return input;
}