ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "agent_automation_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "agent_automation_assignee_id" uuid;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "agent_automation_min_confidence" integer DEFAULT 80 NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "agent_automation_wake_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD CONSTRAINT "inbound_email_mailboxes_agent_automation_assignee_id_agents_id_fk" FOREIGN KEY ("agent_automation_assignee_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD CONSTRAINT "inbound_email_mailboxes_agent_automation_min_confidence_check" CHECK ("agent_automation_min_confidence" >= 0 AND "agent_automation_min_confidence" <= 100);
