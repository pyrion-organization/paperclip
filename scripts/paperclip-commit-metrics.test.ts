import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExportRow,
  escapeCsv,
  ingestSearchItems,
} from "./paperclip-commit-metrics.ts";

function createCache() {
  return {
    commits: {},
    queryKey: "test",
    searchField: "committer-date" as const,
    stats: {},
    updatedAt: null,
    version: 1,
    windows: {},
  };
}

test("ingestSearchItems stores the committer date for committedAt", () => {
  const cache = createCache();
  const shas = new Set<string>();

  ingestSearchItems(cache, [
    {
      author: { login: "alice" },
      commit: {
        author: {
          date: "2026-01-01T00:00:00Z",
          email: "alice@example.test",
          name: "Alice",
        },
        committer: {
          date: "2026-02-01T00:00:00Z",
          email: "ci@example.test",
          name: "CI",
        },
        message: "Ship it",
      },
      html_url: "https://github.example.test/org/repo/commit/abc",
      repository: {
        full_name: "org/repo",
        html_url: "https://github.example.test/org/repo",
      },
      sha: "abc",
    },
  ], shas);

  assert.equal(buildExportRow(cache, "abc").committedAt, "2026-02-01T00:00:00Z");
});

test("escapeCsv neutralizes spreadsheet formulas before CSV quoting", () => {
  assert.equal(escapeCsv("=HYPERLINK(\"https://example.test\")"), `"'=HYPERLINK(""https://example.test"")"`);
  assert.equal(escapeCsv("+1"), "'+1");
  assert.equal(escapeCsv("-1"), "'-1");
  assert.equal(escapeCsv("@cmd"), "'@cmd");
  assert.equal(escapeCsv("\t=cmd"), "'\t=cmd");
  assert.equal(escapeCsv("\r=cmd"), "'\r=cmd");
});
