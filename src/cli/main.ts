#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import { FetchCLI } from "./fetch";
import { ForgeCLI } from "./forge";
import { ReinforceCLI } from "./reinforce";
import { ScrapCLI } from "./scrap";
import { VerifyCLI } from "./verify";
import {VERSION} from "./version";
import {PACKAGE_VERSION} from "../package_version";


const printUsage = () => {
    console.log(
        `Metal CLI version ${VERSION} (${PACKAGE_VERSION})\n\n` +
        `Usage:        $ metal command [options]\n` +
        `Commands:\n` +
        `  fetch       Fetch on-chain metal and decode into file.\n` +
        `  forge       Upload the metal onto blockchain.\n` +
        `  reinforce   Cosigning forge/scrap intermediate transactions for multisig resolution.\n` +
        `  scrap       Scrap the metal on blockchain.\n` +
        `  verify      Verify off-chain file vs on-chain metal.\n` +
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
        case "-h":
        case "--help": {
            printUsage();
            break;
        }
        default: {
            printUsage();
            console.error(`Unknown command: ${argv[0]}`)
        }
    }

    return undefined;
};

main(process.argv.slice(2))
    .catch((e) => {
        console.error(e.toString());
        process.exit(1);
    });