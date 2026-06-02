import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectExpectedVitestProjects,
  findMissingVitestProjects,
  parseRootVitestProjects,
  runCheck,
} from "./check-vitest-projects.mjs";

test("parseRootVitestProjects extracts string entries from root config", () => {
  const projects = parseRootVitestProjects(`
    export default defineConfig({
      test: {
        projects: [
          "packages/shared",
          'server',
        ],
      },
    });
  `);

  assert.deepEqual(projects, ["packages/shared", "server"]);
});

test("collectExpectedVitestProjects maps tracked package configs to project roots", () => {
  const repoRoot = "/repo";
  const listFiles = () => ["vitest.config.ts", "packages/shared/vitest.config.ts", "server/vitest.config.ts"];

  assert.deepEqual(collectExpectedVitestProjects({ repoRoot, listFiles }), [
    "packages/shared",
    "server",
  ]);
});

test("findMissingVitestProjects reports package configs absent from root projects", () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "vitest-projects-"));
  try {
    writeFileSync(
      path.join(tmpRoot, "vitest.config.ts"),
      'export default { test: { projects: ["packages/shared"] } };\n',
    );
    const listFiles = () => [
      "vitest.config.ts",
      "packages/shared/vitest.config.ts",
      "server/vitest.config.ts",
    ];

    assert.deepEqual(findMissingVitestProjects({ repoRoot: tmpRoot, listFiles }), ["server"]);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCheck passes when all tracked package configs are registered", () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "vitest-projects-pass-"));
  try {
    mkdirSync(path.join(tmpRoot, "packages/shared"), { recursive: true });
    writeFileSync(
      path.join(tmpRoot, "vitest.config.ts"),
      'export default { test: { projects: ["packages/shared"] } };\n',
    );
    const listFiles = () => ["vitest.config.ts", "packages/shared/vitest.config.ts"];
    const errors = [];

    const code = runCheck({
      repoRoot: tmpRoot,
      listFiles,
      log: () => {},
      error: (msg) => errors.push(msg),
    });

    assert.equal(code, 0);
    assert.deepEqual(errors, []);
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test("runCheck fails when a tracked package config is missing", () => {
  const tmpRoot = mkdtempSync(path.join(os.tmpdir(), "vitest-projects-fail-"));
  try {
    writeFileSync(
      path.join(tmpRoot, "vitest.config.ts"),
      'export default { test: { projects: ["packages/shared"] } };\n',
    );
    const listFiles = () => [
      "vitest.config.ts",
      "packages/shared/vitest.config.ts",
      "server/vitest.config.ts",
    ];
    const errors = [];

    const code = runCheck({
      repoRoot: tmpRoot,
      listFiles,
      log: () => {},
      error: (msg) => errors.push(msg),
    });

    assert.equal(code, 1);
    assert.ok(errors.some((line) => line.includes("server")));
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
