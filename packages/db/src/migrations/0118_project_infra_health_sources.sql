ALTER TABLE "project_infra_health_checks" ADD COLUMN "last_source_kind" text;--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD COLUMN "last_source_id" text;--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD COLUMN "last_source_detail" text;--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD COLUMN "last_source_metadata" jsonb;