DROP INDEX IF EXISTS "inbound_email_attachments_message_sha_uq";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "inbound_email_attachments_message_sha_idx" ON "inbound_email_attachments" USING btree ("message_id","sha256");
