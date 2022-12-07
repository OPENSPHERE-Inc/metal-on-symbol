import {PublicAccount} from "symbol-sdk";


export namespace EncryptOutput {

    export interface CommandlineOutput {
        payload: Uint8Array;
        senderAccount: PublicAccount;
        recipientAccount: PublicAccount;
    }

}


