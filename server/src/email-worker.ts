import { createDb, applyPendingMigrations } from "@paperclipai/db";
import { loadConfig } from "./config.js";
import { logger } from "./middleware/logger.js";
import { createStorageServiceFromConfig } from "./storage/index.js";
import { inboundEmailService } from "./services/inbound-email.js";

const DEFAULT_IDLE_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  let stopped = false;

  const stop = () => {
    stopped = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  logger.info({ workerId, idleMs, batchSize }, "inbound email worker started");
  while (!stopped) {
    const processed = await svc.runEmailWorkerOnce(workerId, batchSize);
    if (processed === 0) {
      await sleep(idleMs);
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
