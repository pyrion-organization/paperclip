import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { backgroundJobs, type BackgroundJobStatus } from "@paperclipai/db";

const NON_TERMINAL_STATUSES: BackgroundJobStatus[] = ["pending", "running", "retrying"];
const MAX_ERROR_LENGTH = 2_000;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_LENGTH ? `${message.slice(0, MAX_ERROR_LENGTH)}...` : message;
}

export type EnqueueBackgroundJobInput = {
  companyId: string;
  kind: string;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
  runAfter?: Date;
  maxAttempts?: number;
};

export type ClaimBackgroundJobOptions = {
  workerId: string;
  kindPrefix?: string;
  now?: Date;
};

export function backgroundJobService(db: Db) {
  async function enqueue(
    input: EnqueueBackgroundJobInput,
    executor: Db = db,
  ): Promise<typeof backgroundJobs.$inferSelect> {
    const values = {
      companyId: input.companyId,
      kind: input.kind,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
      runAfter: input.runAfter ?? new Date(),
      maxAttempts: input.maxAttempts ?? 3,
    };

    if (!input.dedupeKey) {
      const [job] = await executor.insert(backgroundJobs).values(values).returning();
      return job;
    }

    // Atomic insert relying on the partial unique index
    // background_jobs_active_dedupe_uniq (company_id, kind, dedupe_key)
    // WHERE status IN ('pending','running','retrying') AND dedupe_key IS NOT NULL.
    const inserted = await executor
      .insert(backgroundJobs)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (inserted[0]) return inserted[0];

    const existing = await executor
      .select()
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.companyId, input.companyId),
          eq(backgroundJobs.kind, input.kind),
          eq(backgroundJobs.dedupeKey, input.dedupeKey),
          inArray(backgroundJobs.status, NON_TERMINAL_STATUSES),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (existing) return existing;

    // Lost the race AND the conflicting row already transitioned to a terminal
    // status — safe to retry the insert without conflict.
    const [retried] = await executor
      .insert(backgroundJobs)
      .values(values)
      .onConflictDoNothing()
      .returning();
    if (retried) return retried;

    // Last-ditch: re-select; if still nothing, surface a clear error rather
    // than silently returning undefined.
    const final = await executor
      .select()
      .from(backgroundJobs)
      .where(
        and(
          eq(backgroundJobs.companyId, input.companyId),
          eq(backgroundJobs.kind, input.kind),
          eq(backgroundJobs.dedupeKey, input.dedupeKey),
          inArray(backgroundJobs.status, NON_TERMINAL_STATUSES),
        ),
      )
      .then((rows) => rows[0] ?? null);
    if (final) return final;
    throw new Error("background_jobs.enqueue: could not insert or locate dedupe peer");
  }

  async function claimNext(
    options: ClaimBackgroundJobOptions,
    executor: Db = db,
  ): Promise<typeof backgroundJobs.$inferSelect | null> {
    const now = options.now ?? new Date();
    const nowIso = now.toISOString();
    const kindLike = options.kindPrefix ? `${options.kindPrefix}%` : null;
    const result = await executor.execute(sql`
      with next_job as (
        select id
        from ${backgroundJobs}
        where ${backgroundJobs.status} in ('pending', 'retrying')
          and ${backgroundJobs.runAfter} <= ${nowIso}::timestamptz
          and (${kindLike}::text is null or ${backgroundJobs.kind} like ${kindLike})
        order by ${backgroundJobs.runAfter} asc, ${backgroundJobs.createdAt} asc, ${backgroundJobs.id} asc
        for update skip locked
        limit 1
      )
      update ${backgroundJobs}
      set
        status = 'running',
        locked_by = ${options.workerId},
        locked_at = ${nowIso}::timestamptz,
        attempts = ${backgroundJobs.attempts} + 1,
        updated_at = ${nowIso}::timestamptz
      where ${backgroundJobs.id} in (select id from next_job)
      returning
        id,
        company_id as "companyId",
        kind,
        status,
        dedupe_key as "dedupeKey",
        payload,
        attempts,
        max_attempts as "maxAttempts",
        run_after as "runAfter",
        locked_by as "lockedBy",
        locked_at as "lockedAt",
        last_error as "lastError",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `);
    return Array.isArray(result) ? (result[0] as typeof backgroundJobs.$inferSelect | undefined) ?? null : null;
  }

  async function complete(jobId: string, executor: Db = db): Promise<void> {
    const now = new Date();
    await executor
      .update(backgroundJobs)
      .set({
        status: "succeeded",
        lockedBy: null,
        lockedAt: null,
        lastError: null,
        updatedAt: now,
      })
      .where(eq(backgroundJobs.id, jobId));
  }

  async function fail(
    job: typeof backgroundJobs.$inferSelect,
    error: unknown,
    retryDelayMs = 60_000,
    executor: Db = db,
  ): Promise<void> {
    const now = new Date();
    const lastError = truncateError(error);
    const shouldRetry = job.attempts < job.maxAttempts;
    await executor
      .update(backgroundJobs)
      .set({
        status: shouldRetry ? "retrying" : "dead",
        runAfter: shouldRetry ? new Date(now.getTime() + retryDelayMs) : job.runAfter,
        lockedBy: null,
        lockedAt: null,
        lastError,
        updatedAt: now,
      })
      .where(eq(backgroundJobs.id, job.id));
  }

  async function requeueStaleRunning(
    staleAfterMs: number,
    now = new Date(),
    executor: Db = db,
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - staleAfterMs);
    const rows = await executor
      .update(backgroundJobs)
      .set({
        status: "retrying",
        runAfter: now,
        lockedBy: null,
        lockedAt: null,
        lastError: "Requeued after stale running lock",
        updatedAt: now,
      })
      .where(and(eq(backgroundJobs.status, "running"), lte(backgroundJobs.lockedAt, cutoff)))
      .returning({ id: backgroundJobs.id });
    return rows.length;
  }

  return { enqueue, claimNext, complete, fail, requeueStaleRunning };
}
