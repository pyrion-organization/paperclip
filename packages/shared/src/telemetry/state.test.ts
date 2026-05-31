import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadOrCreateState } from "./state.js";

const tempDirs = new Set<string>();

describe("telemetry state", () => {
  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it("reuses an atomically-created existing state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-telemetry-state-"));
    tempDirs.add(dir);

    const first = loadOrCreateState(dir, "1.0.0");
    const second = loadOrCreateState(dir, "1.0.0");

    expect(second).toEqual(first);
  });
});
