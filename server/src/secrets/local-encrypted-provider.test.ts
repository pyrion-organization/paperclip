import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = new Set<string>();

describe("local encrypted provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY;
    delete process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.clear();
  });

  it("reads an atomically-created key when first creation loses the race", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-local-secrets-"));
    tempDirs.add(dir);
    const keyPath = path.join(dir, "master.key");
    const persistedKey = Buffer.alloc(32, 7).toString("base64");
    fs.writeFileSync(keyPath, persistedKey, "utf8");
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = keyPath;

    const originalExistsSync = fs.existsSync;
    const existsSpy = vi.spyOn(fs, "existsSync").mockImplementation((target) => {
      if (target === keyPath) return false;
      return originalExistsSync(target);
    });
    vi.spyOn(fs, "openSync").mockImplementationOnce(() => {
      const error = new Error("exists") as Error & { code: string };
      error.code = "EEXIST";
      throw error;
    });

    const { localEncryptedProvider } = await import("./local-encrypted-provider.js");
    const prepared = await localEncryptedProvider.createSecret({ value: "secret" });
    existsSpy.mockRestore();
    const resolved = await localEncryptedProvider.resolveVersion({
      material: prepared.material,
      externalRef: null,
    });

    expect(resolved).toBe("secret");
    expect(fs.readFileSync(keyPath, "utf8")).toBe(persistedKey);
  });
});
