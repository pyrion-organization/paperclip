#!/usr/bin/env node
import { cp, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageRoot, "src/migrations");
const target = resolve(packageRoot, "dist/migrations");

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
