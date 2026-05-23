CREATE TABLE "project_infra_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"deployment_target_id" uuid,
	"name" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"provider_account_ref" text,
	"region" text,
	"role" text DEFAULT 'app' NOT NULL,
	"host" text,
	"failover_group" text,
	"failover_rank" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"repair_actions_require_approval" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_infra_health_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"infra_target_id" uuid,
	"name" text NOT NULL,
	"check_type" text DEFAULT 'http' NOT NULL,
	"url" text,
	"expected_status" integer,
	"interval_seconds" integer DEFAULT 300 NOT NULL,
	"timeout_seconds" integer DEFAULT 10 NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_latency_ms" integer,
	"last_error" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_infra_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"infra_target_id" uuid,
	"health_check_id" uuid,
	"issue_id" uuid,
	"source_kind" text NOT NULL,
	"source_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"severity" text DEFAULT 'high' NOT NULL,
	"summary" text NOT NULL,
	"details" text,
	"recommended_action" text,
	"repair_approval_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_infra_targets" ADD CONSTRAINT "project_infra_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_targets" ADD CONSTRAINT "project_infra_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_targets" ADD CONSTRAINT "project_infra_targets_deployment_target_id_project_deployment_targets_id_fk" FOREIGN KEY ("deployment_target_id") REFERENCES "public"."project_deployment_targets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD CONSTRAINT "project_infra_health_checks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD CONSTRAINT "project_infra_health_checks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_health_checks" ADD CONSTRAINT "project_infra_health_checks_infra_target_id_project_infra_targets_id_fk" FOREIGN KEY ("infra_target_id") REFERENCES "public"."project_infra_targets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD CONSTRAINT "project_infra_incidents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD CONSTRAINT "project_infra_incidents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD CONSTRAINT "project_infra_incidents_infra_target_id_project_infra_targets_id_fk" FOREIGN KEY ("infra_target_id") REFERENCES "public"."project_infra_targets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD CONSTRAINT "project_infra_incidents_health_check_id_project_infra_health_checks_id_fk" FOREIGN KEY ("health_check_id") REFERENCES "public"."project_infra_health_checks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD CONSTRAINT "project_infra_incidents_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_incidents" ADD CONSTRAINT "project_infra_incidents_repair_approval_id_approvals_id_fk" FOREIGN KEY ("repair_approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_infra_targets_company_project_idx" ON "project_infra_targets" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_infra_targets_deployment_target_idx" ON "project_infra_targets" USING btree ("deployment_target_id");
--> statement-breakpoint
CREATE INDEX "project_infra_health_checks_company_project_idx" ON "project_infra_health_checks" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_infra_health_checks_target_idx" ON "project_infra_health_checks" USING btree ("infra_target_id");
--> statement-breakpoint
CREATE INDEX "project_infra_incidents_company_project_idx" ON "project_infra_incidents" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_infra_incidents_issue_idx" ON "project_infra_incidents" USING btree ("issue_id");
--> statement-breakpoint
CREATE INDEX "project_infra_incidents_source_idx" ON "project_infra_incidents" USING btree ("company_id","source_kind","source_id");
--> statement-breakpoint
CREATE INDEX "project_infra_incidents_health_check_idx" ON "project_infra_incidents" USING btree ("health_check_id");
