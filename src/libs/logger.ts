
export namespace Logger {

        export enum LogLevel {
            DEBUG,
            INFO,
            WARN,
            ERROR,
            NONE,
        }

        let config = {
            log_level: LogLevel.INFO,
            force_stderr: false,
        }

        export const init = (cfg: Partial<typeof config>) => {
            config = { ...config, ...cfg };
        }

        export const error = (message?: any, ...args: any[]) =>
            config.log_level <= LogLevel.ERROR && console.error(message, ...args);
        export const log = (message?: any, ...args: any[]) =>
            config.log_level <= LogLevel.INFO &&
            (config.force_stderr ? console.warn(message, ...args) : console.log(message, ...args));
        export const info = (message?: any, ...args: any[]) =>
            config.log_level <= LogLevel.INFO &&
            (config.force_stderr ? console.warn(message, ...args) : console.info(message, ...args));
        export const warn = (message?: any, ...args: any[]) =>
            config.log_level <= LogLevel.WARN && console.warn(message, ...args);
        export const debug = (message?: any, ...args: any[]) =>
            config.log_level <= LogLevel.DEBUG &&
            (config.force_stderr ? console.warn(message, ...args) : console.debug(message, ...args));

}