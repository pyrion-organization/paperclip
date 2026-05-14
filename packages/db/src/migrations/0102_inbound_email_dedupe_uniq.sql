DELETE FROM "background_jobs" a
USING "background_jobs" b
WHERE a.id > b.id
  AND a.company_id = b.company_id
  AND a.kind = b.kind
  AND a.dedupe_key IS NOT NULL
  AND a.dedupe_key = b.dedupe_key
  AND a.status IN ('pending', 'running', 'retrying')
  AND b.status IN ('pending', 'running', 'retrying');
--> statement-breakpoint
CREATE UNIQUE INDEX "background_jobs_active_dedupe_uniq"
  ON "background_jobs" ("company_id", "kind", "dedupe_key")
  WHERE "status" IN ('pending', 'running', 'retrying') AND "dedupe_key" IS NOT NULL;
