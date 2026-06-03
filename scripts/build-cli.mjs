#!/usr/bin/env node
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import esbuild from "esbuild";
import config from "../cli/esbuild.config.mjs";
import ensureCliShebang from "./ensure-cli-shebang-lib.mjs";

await esbuild.build(config);

const entrypoint = resolve(process.cwd(), "dist/index.js");
await ensureCliShebang(entrypoint);
await chmod(entrypoint, 0o755);
