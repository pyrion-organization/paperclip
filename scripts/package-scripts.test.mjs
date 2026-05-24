import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("default aggregate test run includes plugin-sdk build dependency bootstrap", () => {
  const scripts = packageJson.scripts;
  const bootstrapCommand = "pnpm --filter @paperclipai/plugin-sdk ensure-build-deps";

  assert.match(scripts.test, /\bpnpm run test:run\b/);
  assert.ok(scripts["test:run"].includes(bootstrapCommand));
  assert.ok(scripts["test:run:general"].includes(bootstrapCommand));
  assert.ok(scripts["test:run:serialized"].includes(bootstrapCommand));
});
