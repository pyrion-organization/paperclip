ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_category" text;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_confidence" integer;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_severity" text;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_recommended_action" text;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_final_action" text;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_summary" text;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_safety_flags" jsonb;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classification_rule_version" text;
ALTER TABLE "inbound_email_messages" ADD COLUMN "classified_at" timestamp with time zone;
