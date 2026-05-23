ALTER TABLE "project_deployment_targets" ADD COLUMN "deploy_command" text;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD COLUMN "rollback_command" text;
--> statement-breakpoint
CREATE TABLE "project_deploy_command_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"deploy_event_id" uuid NOT NULL,
	"deployment_target_id" uuid,
	"approval_id" uuid,
	"command_type" text NOT NULL,
	"status" text NOT NULL,
	"command" text NOT NULL,
	"output" text,
	"exit_code" text,
	"note" text,
	"recorded_by_agent_id" uuid,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_deploy_command_records" ADD CONSTRAINT "project_deploy_command_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_command_records" ADD CONSTRAINT "project_deploy_command_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_command_records" ADD CONSTRAINT "project_deploy_command_records_deploy_event_id_project_deploy_events_id_fk" FOREIGN KEY ("deploy_event_id") REFERENCES "public"."project_deploy_events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_command_records" ADD CONSTRAINT "project_deploy_command_records_deployment_target_id_project_deployment_targets_id_fk" FOREIGN KEY ("deployment_target_id") REFERENCES "public"."project_deployment_targets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_command_records" ADD CONSTRAINT "project_deploy_command_records_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_deploy_command_records" ADD CONSTRAINT "project_deploy_command_records_recorded_by_agent_id_agents_id_fk" FOREIGN KEY ("recorded_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_deploy_command_records_event_idx" ON "project_deploy_command_records" USING btree ("deploy_event_id");
--> statement-breakpoint
CREATE INDEX "project_deploy_command_records_company_project_idx" ON "project_deploy_command_records" USING btree ("company_id","project_id");
