import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const cliPackageJson = JSON.parse(readFileSync(new URL("../cli/package.json", import.meta.url), "utf8"));
const dbPackageJson = JSON.parse(readFileSync(new URL("../packages/db/package.json", import.meta.url), "utf8"));

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
