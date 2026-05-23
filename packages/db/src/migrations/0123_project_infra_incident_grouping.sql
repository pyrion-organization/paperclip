ALTER TABLE "project_infra_incidents" ADD COLUMN "group_key" text;--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD COLUMN "occurrence_count" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD COLUMN "last_occurred_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD COLUMN "escalated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD COLUMN "escalation_reason" text;--> statement-breakpoint
CREATE INDEX "project_infra_incidents_group_idx" ON "project_infra_incidents" USING btree ("company_id","project_id","group_key");--> statement-breakpoint
CREATE UNIQUE INDEX "project_infra_incidents_active_group_uq" ON "project_infra_incidents" USING btree ("company_id","project_id","group_key") WHERE "project_infra_incidents"."group_key" is not null and "project_infra_incidents"."status" in ('open', 'investigating');
