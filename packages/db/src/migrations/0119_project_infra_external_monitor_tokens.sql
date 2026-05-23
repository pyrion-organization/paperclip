ALTER TABLE "project_infra_health_checks" ADD COLUMN "external_monitor_token_hash" text;--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD COLUMN "external_monitor_token_hint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "project_infra_health_checks_external_monitor_token_hash_uq" ON "project_infra_health_checks" USING btree ("external_monitor_token_hash");
