import assert from "assert";
import {Logger} from "../libs";
import fs from "fs";
import PromptSync from "prompt-sync";


const prompt = PromptSync();

export interface StreamInput {
    filePath?: string;
    outputPath?: string;

    // Filled by validator
    stdin?: boolean;
    stdout?: boolean;
}

export const validateStreamInput = async <T extends StreamInput>(_input: Readonly<T>, showPrompt: boolean) => {
    let input: T = { ..._input };

    if (input.filePath && !fs.existsSync(input.filePath)) {
        throw new Error(`${input.filePath}: File not found.`);
    }

    input.stdin = !input.filePath;

    if (input.outputPath && fs.existsSync(input.outputPath)) {
        if (input.stdin) {
            throw new Error(`${input.outputPath}: Already exists.`);
        } else if (
            showPrompt &&
            prompt(`${input.outputPath}: Are you sure overwrite this [y/(n)]? `).toLowerCase() !== "y"
        ) {
            throw new Error(`Canceled by user.`);
        }
    }

    input.stdout = !input.outputPath;

    return input;
};

export const readStreamInput = async <T extends StreamInput>(input: Readonly<T>) => {
    assert(input.filePath || input.stdin);
    if (input.filePath) {
        Logger.log(`${input.filePath}: Reading...`);
        const payload = fs.readFileSync(input.filePath);
        if (!payload.length) {
            throw new Error(`${input.filePath}: The file is empty.`);
        }
        return payload;
    } else {
        Logger.log(`stdin: Reading...`);
        const payload = await new Promise<Uint8Array>((resolve) => {
            const chunks = new Array<Uint8Array>();
            process.stdin.resume();
            process.stdin.on("data", (chunk) => chunks.push(chunk));
            process.stdin.on("end", () => {
                const concat = new Uint8Array(chunks.reduce((acc, curr) => acc + curr.length, 0));
                const getChunk = () => chunks.splice(0, 1).shift();
                for (let chunk = getChunk(), pos = 0; chunk; pos += chunk.length, chunk = getChunk()) {
                    concat.set(chunk, pos);
                }
                resolve(concat);
            });
        });
        if (!payload.length) {
            throw new Error(`stdin: The input is empty.`);
        }
        return payload;
    }
};

export const writeStreamOutput = (payload: Uint8Array, outputPath?: string) => {
    if (outputPath) {
        fs.writeFileSync(outputPath, payload);
    } else {
        process.stdout.write(payload);
    }
};