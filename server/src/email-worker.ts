import { createDb, applyPendingMigrations } from "@paperclipai/db";
import { loadConfig } from "./config.js";
import type { Config } from "./config.js";
import { isProcessRunning, readDatabaseRuntimeState } from "./database-runtime-state.js";
import { logger } from "./middleware/logger.js";
import { createStorageServiceFromConfig } from "./storage/index.js";
import { inboundEmailService } from "./services/inbound-email.js";

const DEFAULT_IDLE_MS = 5_000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_SCHEDULER_INTERVAL_MS = 10_000;
const SHUTDOWN_HARD_DEADLINE_MS = 30_000;

export type EmailWorkerControl = { stopped: boolean; wake: (() => void) | null };

export function sleepUntilEmailWorkerWake(ms: number, control: EmailWorkerControl): Promise<void> {
  return new Promise((resolve) => {
    if (control.stopped) return resolve();
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (control.wake === finish) control.wake = null;
      resolve();
    };
    const timer = setTimeout(finish, ms);
    timer.unref?.();
    control.wake = finish;
  });
}

export function resolveEmailWorkerDatabaseUrl(config: Config, runtimeStatePath?: string): string {
  if (config.databaseUrl) return config.databaseUrl;
  const runtimeState = readDatabaseRuntimeState(runtimeStatePath);
  if (!runtimeState) {
    throw new Error(
      "Inbound email worker in embedded PostgreSQL mode requires the API server to be running first so the active database port can be discovered. Start the API before `pnpm worker:email`, or set DATABASE_URL explicitly.",
    );
  }
  if (!isProcessRunning(runtimeState.pid)) {
    throw new Error(
      "Inbound email worker found stale embedded PostgreSQL runtime state. Start the API before `pnpm worker:email`, or set DATABASE_URL explicitly.",
    );
  }
  if (runtimeState.embeddedPostgresDataDir !== config.embeddedPostgresDataDir) {
    throw new Error(
      "Inbound email worker embedded PostgreSQL runtime state points at a different data directory. Start the matching API instance, or set DATABASE_URL explicitly.",
    );
  }
  return runtimeState.connectionString;
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

  const databaseUrl = resolveEmailWorkerDatabaseUrl(config);
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
  const control: EmailWorkerControl = { stopped: false, wake: null };
  let lastSchedulerTickAt = 0;

  const stop = (signal: string) => {
    if (control.stopped) return;
    control.stopped = true;
    control.wake?.();
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
    try {
      const now = Date.now();
      const runScheduler = now - lastSchedulerTickAt >= schedulerIntervalMs;
      if (runScheduler) lastSchedulerTickAt = now;
      const startedAt = Date.now();
      const result = await svc.runEmailWorkerOnce(workerId, batchSize, { runScheduler });
      const elapsedMs = Date.now() - startedAt;
      const logPayload = {
        workerId,
        elapsedMs,
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        schedulerRan: result.scheduler.ran,
        scheduledPollJobs: result.scheduler.enqueued,
        staleJobsRequeued: result.staleJobsRequeued,
        jobs: result.jobs.map((job) => job.claimed
          ? {
            id: job.jobId,
            kind: job.kind,
            status: job.status,
            companyId: job.companyId,
            mailboxId: job.mailboxId,
            messageId: job.messageId,
            error: job.error,
          }
          : { claimed: false }),
      };
      if (result.processed === 0) {
        logger.info(logPayload, "inbound email worker iteration idle");
      } else if (result.failed > 0) {
        logger.warn(logPayload, "inbound email worker iteration completed with failures");
      } else {
        logger.info(logPayload, "inbound email worker iteration completed");
      }
      if (result.processed === 0 && !control.stopped) {
        await sleepUntilEmailWorkerWake(idleMs, control);
      }
    } catch (err) {
      logger.error({ err, workerId }, "inbound email worker iteration failed");
      if (!control.stopped) await sleepUntilEmailWorkerWake(idleMs, control);
    }
  }
  logger.info({ workerId }, "inbound email worker stopped");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startEmailWorker().catch((err) => {
    logger.error({ err }, "inbound email worker crashed");
    process.exit(1);
  });
}
