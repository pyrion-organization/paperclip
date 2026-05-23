import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import { resolveEmailWorkerDatabaseUrl, sleepUntilEmailWorkerWake, type EmailWorkerControl } from "../email-worker.js";
import { writeDatabaseRuntimeState } from "../database-runtime-state.js";

function workerConfig(overrides?: Partial<Config>): Config {
  return {
    deploymentMode: "local_trusted",
    deploymentExposure: "private",
    bind: "loopback",
    customBindHost: undefined,
    host: "127.0.0.1",
    port: 3100,
    allowedHostnames: [],
    authBaseUrlMode: "auto",
    authPublicBaseUrl: undefined,
    authDisableSignUp: false,
    databaseMode: "embedded-postgres",
    databaseUrl: undefined,
    databaseMigrationUrl: undefined,
    embeddedPostgresDataDir: "/tmp/paperclip-db",
    embeddedPostgresPort: 54329,
    databaseBackupEnabled: false,
    databaseBackupIntervalMinutes: 60,
    databaseBackupRetentionDays: 7,
    databaseBackupDir: "/tmp/paperclip-backups",
    serveUi: true,
    uiDevMiddleware: false,
    secretsProvider: "local_encrypted",
    secretsStrictMode: false,
    secretsMasterKeyFilePath: "/tmp/paperclip-master.key",
    storageProvider: "local_disk",
    storageLocalDiskBaseDir: "/tmp/paperclip-storage",
    storageS3Bucket: "paperclip",
    storageS3Region: "us-east-1",
    storageS3Endpoint: undefined,
    storageS3Prefix: "",
    storageS3ForcePathStyle: false,
    feedbackExportBackendUrl: undefined,
    feedbackExportBackendToken: undefined,
    heartbeatSchedulerEnabled: true,
    heartbeatSchedulerIntervalMs: 30_000,
    companyDeletionEnabled: false,
    telemetryEnabled: false,
    ...overrides,
  };
}

describe("email worker control", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves idle sleep immediately when already stopped", async () => {
    const control: EmailWorkerControl = { stopped: true, wake: null };

    await expect(sleepUntilEmailWorkerWake(30_000, control)).resolves.toBeUndefined();
    expect(control.wake).toBeNull();
  });

  it("wakes idle sleep when shutdown is requested", async () => {
    vi.useFakeTimers();
    const control: EmailWorkerControl = { stopped: false, wake: null };
    let resolved = false;

    const sleeping = sleepUntilEmailWorkerWake(30_000, control).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(false);

    control.stopped = true;
    control.wake?.();

    await sleeping;
    expect(resolved).toBe(true);
    expect(control.wake).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the explicit database URL when configured", () => {
    expect(
      resolveEmailWorkerDatabaseUrl(workerConfig({ databaseUrl: "postgres://configured.example/paperclip" })),
    ).toBe("postgres://configured.example/paperclip");
  });

  it("uses the API-written embedded database runtime state instead of the configured port", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-email-worker-"));
    try {
      const statePath = path.join(dir, "database.json");
      writeDatabaseRuntimeState({
        mode: "embedded-postgres",
        connectionString: "postgres://paperclip:paperclip@127.0.0.1:55432/paperclip",
        pid: process.pid,
        embeddedPostgresDataDir: "/tmp/paperclip-db",
        embeddedPostgresPort: 55432,
        updatedAt: new Date().toISOString(),
      }, statePath);

      expect(resolveEmailWorkerDatabaseUrl(workerConfig({ embeddedPostgresPort: 54329 }), statePath)).toBe(
        "postgres://paperclip:paperclip@127.0.0.1:55432/paperclip",
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects stale embedded database runtime state", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paperclip-email-worker-"));
    try {
      const statePath = path.join(dir, "database.json");
      writeDatabaseRuntimeState({
        mode: "embedded-postgres",
        connectionString: "postgres://paperclip:paperclip@127.0.0.1:55432/paperclip",
        pid: -1,
        embeddedPostgresDataDir: "/tmp/paperclip-db",
        embeddedPostgresPort: 55432,
        updatedAt: new Date().toISOString(),
      }, statePath);

      expect(() => resolveEmailWorkerDatabaseUrl(workerConfig(), statePath)).toThrow(/stale embedded PostgreSQL/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
