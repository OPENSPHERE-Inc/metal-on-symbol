#!/usr/bin/env node
import dotenv from "dotenv";
dotenv.config();

import { main as fetchMain } from "./fetch/main";
import { main as forgeMain } from "./forge/main";
import { main as reinforceMain } from "./reinforce/main";
import { main as scrapMain } from "./scrap/main";
import { main as verifyMain } from "./verify/main";


const VERSION = "1.0";

const printUsage = () => {
    console.log(
        `Metal CLI version ${VERSION}\n\n` +
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
            return fetchMain(argv.slice(1));
        }
        case "forge": {
            return forgeMain(argv.slice(1));
        }
        case "reinforce": {
            return reinforceMain(argv.slice(1));
        }
        case "scrap": {
            return scrapMain(argv.slice(1));
        }
        case "verify": {
            return verifyMain(argv.slice(1));
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
