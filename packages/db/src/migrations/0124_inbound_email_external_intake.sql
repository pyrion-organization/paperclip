CREATE TABLE "inbound_email_external_intake_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"source_kind" text NOT NULL,
	"source_id" text NOT NULL,
	"source_location" text,
	"raw_sha256" text NOT NULL,
	"message_id" text,
	"status" text NOT NULL,
	"inbound_message_id" uuid,
	"error" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"received_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inbound_email_external_intake_records" ADD CONSTRAINT "inbound_email_external_intake_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_external_intake_records" ADD CONSTRAINT "inbound_email_external_intake_records_mailbox_id_inbound_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."inbound_email_mailboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_external_intake_records" ADD CONSTRAINT "inbound_email_external_intake_records_inbound_message_id_inbound_email_messages_id_fk" FOREIGN KEY ("inbound_message_id") REFERENCES "public"."inbound_email_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inbound_email_external_intake_company_status_idx" ON "inbound_email_external_intake_records" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "inbound_email_external_intake_mailbox_created_idx" ON "inbound_email_external_intake_records" USING btree ("company_id","mailbox_id","created_at");--> statement-breakpoint
CREATE INDEX "inbound_email_external_intake_raw_sha_idx" ON "inbound_email_external_intake_records" USING btree ("company_id","raw_sha256");--> statement-breakpoint
CREATE INDEX "inbound_email_external_intake_message_idx" ON "inbound_email_external_intake_records" USING btree ("inbound_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_external_intake_source_uq" ON "inbound_email_external_intake_records" USING btree ("company_id","source_kind","source_id");