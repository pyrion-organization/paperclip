#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_CONFIG = "vitest.config.ts";
const SKIP_DIRS = new Set([".git", ".clawpatch", "dist", "node_modules"]);

export function parseRootVitestProjects(configText) {
  const projectsMatch = configText.match(/projects\s*:\s*\[([\s\S]*?)\]/);
  if (!projectsMatch) {
    throw new Error("Could not find root Vitest test.projects array.");
  }

  const projects = [];
  const stringPattern = /["']([^"']+)["']/g;
  let match;
  while ((match = stringPattern.exec(projectsMatch[1])) !== null) {
    projects.push(match[1]);
  }
  return projects;
}

export function collectVitestConfigFiles(repoRoot, dir = repoRoot) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        files.push(...collectVitestConfigFiles(repoRoot, path.join(dir, entry.name)));
      }
      continue;
    }

    if (entry.isFile() && entry.name === ROOT_CONFIG) {
      files.push(path.relative(repoRoot, path.join(dir, entry.name)));
    }
  }
  return files.sort();
}

export function collectExpectedVitestProjects({ repoRoot, listFiles = collectVitestConfigFiles }) {
  return listFiles(repoRoot)
    .filter((file) => file !== ROOT_CONFIG)
    .map((file) => path.dirname(file))
    .sort();
}

export function findMissingVitestProjects({
  repoRoot,
  readFile = readFileSync,
  listFiles = collectVitestConfigFiles,
}) {
  const configPath = path.join(repoRoot, ROOT_CONFIG);
  const actualProjects = new Set(parseRootVitestProjects(readFile(configPath, "utf8")));
  return collectExpectedVitestProjects({ repoRoot, listFiles }).filter(
    (projectPath) => !actualProjects.has(projectPath),
  );
}

export function runCheck({
  repoRoot,
  readFile = readFileSync,
  listFiles = collectVitestConfigFiles,
  log = console.log,
  error = console.error,
}) {
  const missing = findMissingVitestProjects({ repoRoot, readFile, listFiles });
  if (missing.length === 0) {
    log("  ✓  Root Vitest projects match tracked package Vitest configs.");
    return 0;
  }

  error("ERROR: root vitest.config.ts is missing project entries:\n");
  for (const projectPath of missing) {
    error(`  ${projectPath}`);
  }
  return 1;
}

function main() {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  process.exit(runCheck({ repoRoot }));
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}
