ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "support_replies_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD COLUMN "reply_to_address" text;--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD COLUMN "support_reply_status" text;--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD COLUMN "support_reply_reason" text;--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD COLUMN "support_reply_attempted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD COLUMN "support_reply_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD COLUMN "support_reply_error" text;
