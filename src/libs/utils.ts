import Long from "long";
import {UInt64} from "symbol-sdk";


export namespace Utils {

    export const toXYM = (microXYM: string | Long | UInt64) => {
        const value = microXYM instanceof Long
            ? microXYM
            : Long.fromString(microXYM.toString());
        const decimal = `000000${value.mod(1000000).toString()}`
            .slice(-6)
            .replace(/0+$/g, '');
        const integer = value.div(1000000).toString();

        return `${integer}${decimal && '.' + decimal}`;
    };

    export const toMicroXYM = (xym: string | number) => {
        const [integer, decimal] = xym.toString().split('.');

        return Long.fromString(integer).mul(1000000).add(
            Long.fromString(decimal ? `${decimal}000000`.slice(0, 6) : '0')
        );
    };

    export const runLater = <T>(callback: () => Promise<T>, ms: number): Promise<T> => {
        return new Promise<T>((resolve, reject) => {
            setTimeout(() => {
                try {
                    resolve(callback());
                } catch (e) {
                    reject(e);
                }
            }, ms);
        });
    };

    export const sleep = async (ms: number): Promise<void> => {
        return runLater(async () => {}, ms);
    };

}

