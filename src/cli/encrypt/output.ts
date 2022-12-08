import {PublicAccount} from "symbol-sdk";


export namespace EncryptOutput {

    export interface CommandlineOutput {
        payload: Uint8Array;
        senderPubAccount: PublicAccount;
        recipientPubAccount: PublicAccount;
    }

}


