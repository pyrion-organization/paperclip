ALTER TABLE "inbound_email_messages" ADD COLUMN "source_deleted_at" timestamp with time zone;
ALTER TABLE "inbound_email_messages" ADD COLUMN "source_delete_error" text;
