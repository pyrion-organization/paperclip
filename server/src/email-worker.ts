import { createDb, applyPendingMigrations } from "@paperclipai/db";
import { loadConfig } from "./config.js";
import { logger } from "./middleware/logger.js";
import { createStorageServiceFromConfig } from "./storage/index.js";
import { inboundEmailService } from "./services/inbound-email.js";

const DEFAULT_IDLE_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SCHEDULER_INTERVAL_MS = 10_000;
const SHUTDOWN_HARD_DEADLINE_MS = 30_000;

function sleep(ms: number, signal: { stopped: boolean }): Promise<void> {
  return new Promise((resolve) => {
    if (signal.stopped) return resolve();
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function resolveDatabaseUrl(config: ReturnType<typeof loadConfig>): string {
  if (config.databaseUrl) return config.databaseUrl;
  return `postgres://paperclip:paperclip@127.0.0.1:${config.embeddedPostgresPort}/paperclip`;
}

export async function startEmailWorker() {
  const config = loadConfig();
  if (process.env.PAPERCLIP_SECRETS_PROVIDER === undefined) {
    process.env.PAPERCLIP_SECRETS_PROVIDER = config.secretsProvider;
  }
  if (process.env.PAPERCLIP_SECRETS_STRICT_MODE === undefined) {
    process.env.PAPERCLIP_SECRETS_STRICT_MODE = config.secretsStrictMode ? "true" : "false";
  }
  if (process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE === undefined) {
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = config.secretsMasterKeyFilePath;
  }

  const databaseUrl = resolveDatabaseUrl(config);
  await applyPendingMigrations(config.databaseMigrationUrl ?? databaseUrl);

  const db = createDb(databaseUrl);
  const storage = createStorageServiceFromConfig(config);
  const svc = inboundEmailService(db, storage);
  const workerId = `email-worker-${process.pid}`;
  const idleMs = Math.max(1_000, Number(process.env.PAPERCLIP_EMAIL_WORKER_IDLE_MS) || DEFAULT_IDLE_MS);
  const batchSize = Math.max(1, Number(process.env.PAPERCLIP_EMAIL_WORKER_BATCH_SIZE) || DEFAULT_BATCH_SIZE);
  const schedulerIntervalMs = Math.max(
    1_000,
    Number(process.env.PAPERCLIP_EMAIL_WORKER_SCHEDULER_INTERVAL_MS) || DEFAULT_SCHEDULER_INTERVAL_MS,
  );
  const control = { stopped: false };
  let lastSchedulerTickAt = 0;

  const stop = (signal: string) => {
    if (control.stopped) return;
    control.stopped = true;
    logger.info({ workerId, signal }, "inbound email worker draining");
    const hardTimer = setTimeout(() => {
      logger.warn({ workerId }, "inbound email worker hard exit after drain timeout");
      process.exit(1);
    }, SHUTDOWN_HARD_DEADLINE_MS);
    hardTimer.unref?.();
  };
  process.once("SIGINT", () => stop("SIGINT"));
  process.once("SIGTERM", () => stop("SIGTERM"));

  logger.info({ workerId, idleMs, batchSize, schedulerIntervalMs }, "inbound email worker started");
  while (!control.stopped) {
    const now = Date.now();
    const runScheduler = now - lastSchedulerTickAt >= schedulerIntervalMs;
    if (runScheduler) lastSchedulerTickAt = now;
    const processed = await svc.runEmailWorkerOnce(workerId, batchSize, { runScheduler });
    if (processed === 0 && !control.stopped) {
      await sleep(idleMs, control);
    }
  }
  logger.info({ workerId }, "inbound email worker stopped");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startEmailWorker().catch((err) => {
    logger.error({ err }, "inbound email worker crashed");
    process.exitCode = 1;
  });
}
