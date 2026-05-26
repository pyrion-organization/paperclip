ALTER TABLE "calendar_items" RENAME COLUMN "last_metadata_scanned_at" TO "last_details_scanned_at";
--> statement-breakpoint
UPDATE "issues"
SET "origin_kind" = 'calendar_missing_details'
WHERE "origin_kind" = 'calendar_missing_metadata';
--> statement-breakpoint
UPDATE "activity_log"
SET "action" = 'calendar.details_scan_completed'
WHERE "action" = 'calendar.metadata_scan_completed';
