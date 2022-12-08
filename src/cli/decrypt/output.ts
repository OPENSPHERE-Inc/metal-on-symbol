import {PublicAccount} from "symbol-sdk";


export namespace DecryptOutput {

    export interface CommandlineOutput {
        payload: Uint8Array;
        senderPubAccount: PublicAccount;
        recipientPubAccount: PublicAccount;
    }

}


