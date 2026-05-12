CREATE TABLE "email_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"issue_id" uuid,
	"recipient_user_id" text,
	"recipient_email" text,
	"subject" text,
	"payload" jsonb,
	"requested_by_actor_type" text DEFAULT 'system' NOT NULL,
	"requested_by_actor_id" text DEFAULT 'email-notifications' NOT NULL,
	"requested_by_agent_id" uuid,
	"requested_by_run_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"last_error" text,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_requested_by_agent_id_agents_id_fk" FOREIGN KEY ("requested_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_requested_by_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("requested_by_run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_notifications_company_status_scheduled_idx" ON "email_notifications" USING btree ("company_id","status","scheduled_at");--> statement-breakpoint
CREATE INDEX "email_notifications_issue_kind_created_idx" ON "email_notifications" USING btree ("issue_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "email_notifications_status_updated_idx" ON "email_notifications" USING btree ("status","updated_at");
