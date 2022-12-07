
export namespace Logger {

        let config = {
            logging: true,
            force_stderr: false,
        }

        export const init = (cfg: Partial<typeof config>) => {
            config = { ...config, ...cfg };
        }

        export const error = (message?: any, ...args: any[]) => config.logging && console.error(message, ...args);
        export const warn = (message?: any, ...args: any[]) => config.logging && console.warn(message, ...args);
        export const log = (message?: any, ...args: any[]) =>
            config.logging && (config.force_stderr ? console.warn(message, ...args) : console.log(message, ...args));
        export const info = (message?: any, ...args: any[]) =>
            config.logging && (config.force_stderr ? console.warn(message, ...args) : console.info(message, ...args));
        export const debug = (message?: any, ...args: any[]) =>
            config.logging && (config.force_stderr ? console.warn(message, ...args) : console.debug(message, ...args));

}