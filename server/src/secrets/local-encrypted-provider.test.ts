import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const tempDirs = new Set<string>();

describe("local encrypted provider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
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
    vi.spyOn(fs, "linkSync").mockImplementationOnce(() => {
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

  it("publishes a generated key only after the temp file contains a valid key", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-local-secrets-"));
    tempDirs.add(dir);
    const keyPath = path.join(dir, "master.key");
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = keyPath;

    const originalLinkSync = fs.linkSync;
    vi.spyOn(fs, "linkSync").mockImplementationOnce((tempPath, finalPath) => {
      expect(finalPath).toBe(keyPath);
      expect(tempPath).not.toBe(keyPath);
      const raw = fs.readFileSync(tempPath, "utf8").trim();
      expect(Buffer.from(raw, "base64")).toHaveLength(32);
      expect(fs.existsSync(keyPath)).toBe(false);
      return originalLinkSync(tempPath, finalPath);
    });

    const { localEncryptedProvider } = await import("./local-encrypted-provider.js");
    const prepared = await localEncryptedProvider.createSecret({ value: "secret" });
    const resolved = await localEncryptedProvider.resolveVersion({
      material: prepared.material,
      externalRef: null,
    });

    expect(resolved).toBe("secret");
    expect(Buffer.from(fs.readFileSync(keyPath, "utf8").trim(), "base64")).toHaveLength(32);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
