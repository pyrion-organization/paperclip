import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PaperclipConfig } from "../config/schema.js";
import { databaseCheck, deploymentAuthCheck, logCheck, storageCheck } from "../checks/index.js";

const ORIGINAL_ENV = { ...process.env };

function makeConfig(root: string): PaperclipConfig {
  return {
    $meta: {
      version: 1,
      updatedAt: "2026-05-30T00:00:00.000Z",
      source: "configure",
    },
    database: {
      mode: "embedded-postgres",
      embeddedPostgresDataDir: path.join(root, "db"),
      embeddedPostgresPort: 55432,
      backup: {
        enabled: true,
        intervalMinutes: 60,
        retentionDays: 30,
        dir: path.join(root, "backups"),
      },
    },
    logging: {
      mode: "file",
      logDir: path.join(root, "logs"),
    },
    server: {
      deploymentMode: "authenticated",
      exposure: "private",
      host: "127.0.0.1",
      port: 3100,
      allowedHostnames: [],
      serveUi: true,
    },
    auth: {
      baseUrlMode: "auto",
      disableSignUp: false,
    },
    telemetry: {
      enabled: false,
    },
    storage: {
      provider: "local_disk",
      localDisk: {
        baseDir: path.join(root, "storage"),
      },
      s3: {
        bucket: "",
        region: "",
        prefix: "",
        forcePathStyle: false,
      },
    },
    secrets: {
      provider: "local_encrypted",
      strictMode: false,
      localEncrypted: {
        keyFilePath: path.join(root, "secrets", "master.key"),
      },
    },
  };
}

describe("doctor checks", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.PAPERCLIP_AGENT_JWT_SECRET;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns failed results instead of throwing when configured directories are files", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-checks-"));
    const config = makeConfig(root);
    fs.writeFileSync(config.database.embeddedPostgresDataDir, "not a directory");
    fs.writeFileSync(config.logging.logDir, "not a directory");
    fs.writeFileSync(config.storage.localDisk.baseDir, "not a directory");

    await expect(databaseCheck(config)).resolves.toMatchObject({ status: "fail" });
    expect(logCheck(config)).toMatchObject({ status: "fail" });
    expect(storageCheck(config)).toMatchObject({ status: "fail" });
  });

  it("falls back to PAPERCLIP_AGENT_JWT_SECRET when BETTER_AUTH_SECRET is blank", () => {
    const config = makeConfig(fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-auth-check-")));
    process.env.BETTER_AUTH_SECRET = "   ";
    process.env.PAPERCLIP_AGENT_JWT_SECRET = "jwt-secret";

    expect(deploymentAuthCheck(config)).toMatchObject({ status: "pass" });
  });
});
