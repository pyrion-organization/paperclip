CREATE TABLE "project_deployment_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"environment" text DEFAULT 'production' NOT NULL,
	"provider" text DEFAULT 'manual' NOT NULL,
	"target_url" text,
	"health_check_url" text,
	"deploy_notes" text,
	"rollback_instructions" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_deploy_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"deployment_target_id" uuid,
	"issue_id" uuid,
	"approval_id" uuid,
	"status" text NOT NULL,
	"summary" text NOT NULL,
	"changed_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tests_run" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rollback_plan" text NOT NULL,
	"maintenance_message" text,
	"metadata" jsonb,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD CONSTRAINT "project_deployment_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD CONSTRAINT "project_deploy_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD CONSTRAINT "project_deploy_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD CONSTRAINT "project_deploy_events_deployment_target_id_project_deployment_targets_id_fk" FOREIGN KEY ("deployment_target_id") REFERENCES "public"."project_deployment_targets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD CONSTRAINT "project_deploy_events_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD CONSTRAINT "project_deploy_events_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD CONSTRAINT "project_deploy_events_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_deployment_targets_company_project_idx" ON "project_deployment_targets" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_deployment_targets_project_name_uq" ON "project_deployment_targets" USING btree ("project_id","name");
--> statement-breakpoint
CREATE INDEX "project_deploy_events_company_project_idx" ON "project_deploy_events" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_deploy_events_approval_idx" ON "project_deploy_events" USING btree ("approval_id");
--> statement-breakpoint
CREATE INDEX "project_deploy_events_issue_idx" ON "project_deploy_events" USING btree ("issue_id");
