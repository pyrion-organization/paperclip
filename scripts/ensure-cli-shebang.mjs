#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const shebang = "#!/usr/bin/env node";
const [, , entrypoint] = process.argv;

if (!entrypoint) {
  console.error("Usage: ensure-cli-shebang.mjs <entrypoint>");
  process.exit(1);
}

const entrypointPath = resolve(process.cwd(), entrypoint);
const contents = await readFile(entrypointPath, "utf8");

if (contents.startsWith(`${shebang}\n`)) {
  process.exit(0);
}

const withoutMisplacedShebang = contents.replace(/^#!\/usr\/bin\/env node\r?\n/m, "");
await writeFile(entrypointPath, `${shebang}\n${withoutMisplacedShebang}`);
