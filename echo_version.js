const fs = require("fs");
const assert = require("assert");
assert(process.argv[2]);
assert(process.env.npm_package_version);
fs.writeFileSync(process.argv[2], `export const PACKAGE_VERSION="${process.env.npm_package_version}";`, "utf-8");
