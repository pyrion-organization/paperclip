ALTER TABLE "inbound_email_messages" ADD COLUMN "source_seen_at" timestamp with time zone;
ALTER TABLE "inbound_email_messages" ADD COLUMN "source_seen_error" text;
