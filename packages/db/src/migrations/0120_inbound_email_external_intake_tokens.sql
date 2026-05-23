ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "external_intake_token_hash" text;--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD COLUMN "external_intake_token_hint" text;--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_mailboxes_external_intake_token_hash_uq" ON "inbound_email_mailboxes" USING btree ("external_intake_token_hash");