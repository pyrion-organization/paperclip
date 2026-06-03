import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const cliPackageJson = JSON.parse(readFileSync(new URL("../cli/package.json", import.meta.url), "utf8"));
const claudeLocalPackageJson = JSON.parse(readFileSync(new URL("../packages/adapters/claude-local/package.json", import.meta.url), "utf8"));
const dbPackageJson = JSON.parse(readFileSync(new URL("../packages/db/package.json", import.meta.url), "utf8"));
const mcpServerPackageJson = JSON.parse(readFileSync(new URL("../packages/mcp-server/package.json", import.meta.url), "utf8"));

test("default aggregate test run includes plugin-sdk build dependency bootstrap", () => {
  const scripts = packageJson.scripts;
  const bootstrapCommand = "pnpm --filter @paperclipai/plugin-sdk ensure-build-deps";

  assert.match(scripts.test, /\bpnpm run test:run\b/);
  assert.ok(scripts["test:run"].includes(bootstrapCommand));
  assert.ok(scripts["test:run:general"].includes(bootstrapCommand));
  assert.ok(scripts["test:run:serialized"].includes(bootstrapCommand));
});

test("CLI build script uses the portable Node build helper", () => {
  assert.equal(cliPackageJson.scripts.build, "node ../scripts/build-cli.mjs");
});

test("db build script uses the idempotent migrations copy helper", () => {
  assert.equal(
    dbPackageJson.scripts.build,
    "pnpm run check:migrations && tsc && node scripts/copy-migrations.mjs",
  );
});

test("Claude local adapter build cleans stale dist artifacts before compiling", () => {
  assert.equal(claudeLocalPackageJson.scripts.build, "pnpm run clean && tsc");
});

test("MCP server package exports built JavaScript for runtime consumers", () => {
  assert.deepEqual(mcpServerPackageJson.exports["."], {
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  });
});
