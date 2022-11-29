import {Account, Convert} from "symbol-sdk";
import bs58 from "bs58";


for (let i = 0; i < 65536; i++) {
    const header = `0000${i.toString(16).toUpperCase()}`.slice(-4);
    const account = Account.generateNewAccount(152);
    const hashBytes = Convert.hexToUint8(
        header + account.publicKey
    );
    const encoded = bs58.encode(hashBytes);
    if (encoded.startsWith("Fe")) {
        console.log(`${header}: ${bs58.encode(hashBytes)}`);
    }
}
