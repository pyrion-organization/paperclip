#!/usr/bin/env node
import { cp, rm } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const source = resolve(packageRoot, "src/migrations");
const target = resolve(packageRoot, "dist/migrations");

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
