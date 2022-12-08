import dotenv from "dotenv";
dotenv.config({ path: './.env.test' });

import {initTestEnv, SymbolTest} from "./utils";
import assert from "assert";
import {DecryptCLI, EncryptCLI} from "../cli";
import {Account, NetworkType} from "symbol-sdk";
import fs from "fs";


describe("Encrypt/Decrypt CLI", () => {
    let inputFile: string;
    let encryptedFile: string;
    let decryptedFile: string;
    let targetAccount: Account;

    beforeAll(async () => {
        initTestEnv();

        targetAccount = Account.generateNewAccount(NetworkType.TEST_NET);

        assert(process.env.TEST_INPUT_FILE);
        inputFile = process.env.TEST_INPUT_FILE;
        encryptedFile = `test.enc.${targetAccount.address.plain()}.out`;
        decryptedFile = `test.dec.${targetAccount.address.plain()}.out`;
    }, 600000);

    afterAll(() => {
        if (fs.existsSync(encryptedFile)) {
            fs.unlinkSync(encryptedFile);
        }
        if (fs.existsSync(decryptedFile)) {
            fs.unlinkSync(decryptedFile);
        }
    });

    it("Encrypt file", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await EncryptCLI.main([
            "-f",
            "--priv-key", signerAccount.privateKey,
            "--to", targetAccount.publicKey,
            "--out", encryptedFile,
            inputFile,
        ]);

        expect(output?.payload).toBeDefined();
        expect(output?.senderPubAccount).toStrictEqual(signerAccount.publicAccount);
        expect(output?.recipientPubAccount).toStrictEqual(targetAccount.publicAccount);
        expect(fs.existsSync(encryptedFile)).toBeTruthy();

        const plain = fs.readFileSync(inputFile);
        const encrypted = fs.readFileSync(encryptedFile);

        expect(output?.payload.buffer).toStrictEqual(encrypted.buffer);
        expect(output?.payload.buffer).not.toStrictEqual(plain.buffer);
        expect(encrypted.buffer).not.toStrictEqual(plain.buffer);
    }, 600000);

    it("Decrypt file", async () => {
        const { signerAccount } = await SymbolTest.getNamedAccounts();
        const output = await DecryptCLI.main([
            "-f",
            "--priv-key", targetAccount.privateKey,
            "--from", signerAccount.publicKey,
            "--out", decryptedFile,
            encryptedFile,
        ]);

        expect(output?.payload).toBeDefined();
        expect(output?.senderPubAccount).toStrictEqual(signerAccount.publicAccount);
        expect(output?.recipientPubAccount).toStrictEqual(targetAccount.publicAccount);
        expect(fs.existsSync(encryptedFile)).toBeTruthy();

        const plain = fs.readFileSync(inputFile);
        const decrypted = fs.readFileSync(decryptedFile);

        expect(output?.payload.buffer).toStrictEqual(decrypted.buffer);
        expect(output?.payload.buffer).toStrictEqual(plain.buffer);
        expect(decrypted.buffer).toStrictEqual(plain.buffer);
    }, 600000);

});