ALTER TABLE "email_notifications" ADD COLUMN "claim_token" text;--> statement-breakpoint
ALTER TABLE "email_notifications" ADD COLUMN "claimed_at" timestamp with time zone;