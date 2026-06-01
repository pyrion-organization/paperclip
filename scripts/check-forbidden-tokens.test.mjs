import assert from "node:assert/strict";
import test from "node:test";

import { runForbiddenTokenCheck } from "./check-forbidden-tokens.mjs";

test("runForbiddenTokenCheck passes forbidden tokens as git argv", () => {
  const token = '$(touch injected) "quoted"';
  const calls = [];

  const code = runForbiddenTokenCheck({
    repoRoot: "/repo",
    tokens: [token],
    execFile: (file, args, options) => {
      calls.push({ file, args, options });
      return "";
    },
    log: () => {},
    error: () => {},
  });

  assert.equal(code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "git");
  assert.deepEqual(calls[0].args, [
    "grep",
    "-in",
    "--no-color",
    "--",
    token,
    "--",
    ":!pnpm-lock.yaml",
    ":!.git",
  ]);
  assert.equal(calls[0].options.cwd, "/repo");
});
