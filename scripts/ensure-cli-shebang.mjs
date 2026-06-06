#!/usr/bin/env node
import { resolve } from "node:path";
import ensureCliShebang from "./ensure-cli-shebang-lib.mjs";

const [, , entrypoint] = process.argv;

if (!entrypoint) {
  console.error("Usage: ensure-cli-shebang.mjs <entrypoint>");
  process.exit(1);
}

const entrypointPath = resolve(process.cwd(), entrypoint);
await ensureCliShebang(entrypointPath);
