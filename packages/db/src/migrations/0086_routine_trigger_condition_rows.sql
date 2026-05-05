UPDATE "routine_triggers"
SET "conditions" = CASE
  WHEN jsonb_typeof("conditions"->'projectStatuses') = 'array' THEN (
    SELECT CASE
      WHEN count(*) = 0 THEN NULL
      ELSE jsonb_build_array(
        jsonb_build_object(
          'type', 'project_status',
          'statuses', jsonb_agg("status" ORDER BY "ord")
        )
      )
    END
    FROM (
      SELECT DISTINCT
        "status",
        array_position(ARRAY['backlog', 'planned', 'in_progress', 'completed', 'cancelled']::text[], "status") AS "ord"
      FROM jsonb_array_elements_text("conditions"->'projectStatuses') AS "legacy"("status")
      WHERE "status" = ANY(ARRAY['backlog', 'planned', 'in_progress', 'completed', 'cancelled']::text[])
    ) AS "normalized"
  )
  ELSE NULL
END
WHERE jsonb_typeof("conditions") = 'object'
  AND "conditions" ? 'projectStatuses';
