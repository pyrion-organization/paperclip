const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveScreenshotUrl,
  shouldAttachAuthorization,
} = require("./screenshot.cjs");

test("resolveScreenshotUrl keeps absolute targets and resolves paths against apiBase", () => {
  assert.equal(
    resolveScreenshotUrl("/PAPA/agents/cto/instructions", "http://localhost:3100"),
    "http://localhost:3100/PAPA/agents/cto/instructions",
  );
  assert.equal(
    resolveScreenshotUrl("http://127.0.0.1:9999/shot", "http://localhost:3100"),
    "http://127.0.0.1:9999/shot",
  );
});

test("shouldAttachAuthorization only allows the saved Paperclip origin", () => {
  assert.equal(
    shouldAttachAuthorization("http://localhost:3100/PAPA/agents/cto/instructions", "http://localhost:3100"),
    true,
  );
  assert.equal(
    shouldAttachAuthorization("http://127.0.0.1:9999/shot", "http://localhost:3100"),
    false,
  );
});
