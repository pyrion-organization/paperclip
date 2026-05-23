ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "allow_projectless_triage" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "project_fallback_mode" text DEFAULT 'create_projectless_triage' NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_rules" ADD COLUMN "body_pattern" text;--> statement-breakpoint
ALTER TABLE "inbound_email_rules" ADD COLUMN "classification_category" text;--> statement-breakpoint
ALTER TABLE "inbound_email_rules" ADD COLUMN "project_fallback_mode" text;
