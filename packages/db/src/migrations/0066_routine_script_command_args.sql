ALTER TABLE "routines" ADD COLUMN "script_command_args" text[];
--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "remediation_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "remediation_prompt" text;
--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "remediation_assignee_agent_id" uuid REFERENCES "agents"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "routine_runs" ADD COLUMN "retry_of_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "routine_runs" ADD COLUMN "retry_attempt" integer;
