CREATE TABLE "project_infra_action_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"infra_target_id" uuid,
	"approval_id" uuid,
	"action_type" text NOT NULL,
	"status" text DEFAULT 'approval_requested' NOT NULL,
	"summary" text NOT NULL,
	"rationale" text NOT NULL,
	"proposed_action" text NOT NULL,
	"rollback_plan" text,
	"risk" text,
	"provider" text,
	"region" text,
	"evidence_required" text,
	"metadata" jsonb,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_infra_action_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"approval_id" uuid,
	"status" text NOT NULL,
	"evidence" text NOT NULL,
	"output" text,
	"recorded_by_agent_id" uuid,
	"recorded_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_infra_action_proposals" ADD CONSTRAINT "project_infra_action_proposals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_proposals" ADD CONSTRAINT "project_infra_action_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_proposals" ADD CONSTRAINT "project_infra_action_proposals_incident_id_project_infra_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."project_infra_incidents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_proposals" ADD CONSTRAINT "project_infra_action_proposals_infra_target_id_project_infra_targets_id_fk" FOREIGN KEY ("infra_target_id") REFERENCES "public"."project_infra_targets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_proposals" ADD CONSTRAINT "project_infra_action_proposals_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_proposals" ADD CONSTRAINT "project_infra_action_proposals_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_evidence" ADD CONSTRAINT "project_infra_action_evidence_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_evidence" ADD CONSTRAINT "project_infra_action_evidence_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_evidence" ADD CONSTRAINT "project_infra_action_evidence_proposal_id_project_infra_action_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."project_infra_action_proposals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_evidence" ADD CONSTRAINT "project_infra_action_evidence_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_infra_action_evidence" ADD CONSTRAINT "project_infra_action_evidence_recorded_by_agent_id_agents_id_fk" FOREIGN KEY ("recorded_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "project_infra_action_proposals_company_project_idx" ON "project_infra_action_proposals" USING btree ("company_id","project_id");
--> statement-breakpoint
CREATE INDEX "project_infra_action_proposals_incident_idx" ON "project_infra_action_proposals" USING btree ("incident_id");
--> statement-breakpoint
CREATE INDEX "project_infra_action_proposals_approval_idx" ON "project_infra_action_proposals" USING btree ("approval_id");
--> statement-breakpoint
CREATE INDEX "project_infra_action_evidence_proposal_idx" ON "project_infra_action_evidence" USING btree ("proposal_id");
--> statement-breakpoint
CREATE INDEX "project_infra_action_evidence_company_project_idx" ON "project_infra_action_evidence" USING btree ("company_id","project_id");
