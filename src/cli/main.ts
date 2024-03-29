#!/usr/bin/env node
import "./env";
import { Logger } from "../libs";
import { PACKAGE_VERSION } from "../package_version";
import { ReinforceCLIV1, ScrapCLIV1 } from "./compat";
import { DecryptCLI } from "./decrypt";
import { EncryptCLI } from "./encrypt";
import { FetchCLI } from "./fetch";
import { ForgeCLI } from "./forge";
import { ReinforceCLI } from "./reinforce";
import { ScrapCLI } from "./scrap";
import { VerifyCLI } from "./verify";
import { VERSION } from "./version";


Logger.init({ force_stderr: true });

const printUsage = () => {
    Logger.info(
        `Metal CLI version ${VERSION} (${PACKAGE_VERSION})\n\n` +
        `Usage:        $ metal command [options]\n` +
        `Commands:\n` +
        `  decrypt     Decrypt file with AES-GCM algorithm\n` +
        `  encrypt     Encrypt file with AES-GCM algorithm\n` +
        `  fetch       Fetch on-chain metal and decode into file.\n` +
        `  forge       Upload the metal onto blockchain.\n` +
        `  reinforce   Cosigning forge/scrap intermediate transactions for multisig resolution.\n` +
        `  scrap       Scrap the metal on blockchain.\n` +
        `  verify      Verify off-chain file vs on-chain metal.\n` +
        `Legacy compat commands (V1): reinforce-v1, scrap-v1\n` +
        `Options:\n` +
        `  -h, --help  Show command line usage.\n`
    );
};

const main = async (argv: string[]) => {
    if (!argv.length) {
        printUsage();
        return;
    }

    switch (argv[0]) {
        case "decrypt": {
            return DecryptCLI.main(argv.slice(1));
        }
        case "encrypt": {
            return EncryptCLI.main(argv.slice(1));
        }
        case "fetch": {
            return FetchCLI.main(argv.slice(1));
        }
        case "forge": {
            return ForgeCLI.main(argv.slice(1));
        }
        case "reinforce": {
            return ReinforceCLI.main(argv.slice(1));
        }
        case "scrap": {
            return ScrapCLI.main(argv.slice(1));
        }
        case "verify": {
            return VerifyCLI.main(argv.slice(1));
        }
        case "reinforce-v1": {
            return ReinforceCLIV1.main(argv.slice(1));
        }
        case "scrap-v1": {
            return ScrapCLIV1.main(argv.slice(1));
        }
        case "-h":
        case "--help": {
            printUsage();
            break;
        }
        default: {
            printUsage();
            Logger.error(`Unknown command: ${argv[0]}`)
        }
    }

    return undefined;
};

main(process.argv.slice(2))
    .catch((e) => {
        Logger.error(e.toString());
        process.exit(1);
    });
