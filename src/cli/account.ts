import {Account, PublicAccount} from "symbol-sdk";
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
    input: T
) => {
    const { networkType } = await SymbolService.getNetwork();

    if (!input.signerPrivateKey) {
        input.signerPrivateKey = prompt("Signer Private Key? ");
        if (!input.signerPrivateKey) {
            throw Error(
                "Signer's private key wasn't specified. [--priv-key value] or SIGNER_PRIVATE_KEY are required."
            );
        }
    }
    input.signer = Account.createFromPrivateKey(input.signerPrivateKey, networkType);

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

    input.cosigners = input.cosignerPrivateKeys?.map(
        (privateKey) => Account.createFromPrivateKey(privateKey, networkType)
    );

    return input;
};