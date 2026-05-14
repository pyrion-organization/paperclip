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
  return {
    async enqueue(input: EnqueueBackgroundJobInput): Promise<typeof backgroundJobs.$inferSelect> {
      if (input.dedupeKey) {
        const existing = await db
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
      }

      const [job] = await db
        .insert(backgroundJobs)
        .values({
          companyId: input.companyId,
          kind: input.kind,
          payload: input.payload ?? {},
          dedupeKey: input.dedupeKey ?? null,
          runAfter: input.runAfter ?? new Date(),
          maxAttempts: input.maxAttempts ?? 3,
        })
        .returning();
      return job;
    },

    async claimNext(options: ClaimBackgroundJobOptions): Promise<typeof backgroundJobs.$inferSelect | null> {
      const now = options.now ?? new Date();
      const nowIso = now.toISOString();
      const kindLike = options.kindPrefix ? `${options.kindPrefix}%` : null;
      const result = await db.execute(sql`
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
    },

    async complete(jobId: string): Promise<void> {
      const now = new Date();
      await db
        .update(backgroundJobs)
        .set({
          status: "succeeded",
          lockedBy: null,
          lockedAt: null,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(backgroundJobs.id, jobId));
    },

    async fail(job: typeof backgroundJobs.$inferSelect, error: unknown, retryDelayMs = 60_000): Promise<void> {
      const now = new Date();
      const lastError = truncateError(error);
      const shouldRetry = job.attempts < job.maxAttempts;
      await db
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
    },

    async requeueStaleRunning(staleAfterMs: number, now = new Date()): Promise<number> {
      const cutoff = new Date(now.getTime() - staleAfterMs);
      const rows = await db
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
    },
  };
}
