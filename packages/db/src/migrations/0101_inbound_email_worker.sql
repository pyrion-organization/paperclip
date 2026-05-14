CREATE TABLE "background_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"dedupe_key" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" text,
	"locked_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_mailboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"provider" text DEFAULT 'imap' NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 993 NOT NULL,
	"username" text NOT NULL,
	"password_secret_name" text,
	"folder" text DEFAULT 'INBOX' NOT NULL,
	"tls" boolean DEFAULT true NOT NULL,
	"poll_interval_seconds" integer DEFAULT 60 NOT NULL,
	"target_project_id" uuid,
	"create_mode" text DEFAULT 'issue' NOT NULL,
	"mark_seen" boolean DEFAULT true NOT NULL,
	"last_poll_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mailbox_id" uuid,
	"enabled" boolean DEFAULT true NOT NULL,
	"sender_pattern" text,
	"subject_pattern" text,
	"target_project_id" uuid,
	"create_mode" text DEFAULT 'issue' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"label_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"mailbox_id" uuid NOT NULL,
	"provider_uid" text,
	"message_id" text,
	"raw_sha256" text NOT NULL,
	"from_address" text,
	"to_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text,
	"received_at" timestamp with time zone,
	"status" text DEFAULT 'discovered' NOT NULL,
	"body_text" text,
	"body_html" text,
	"raw_storage_key" text,
	"raw_content_type" text DEFAULT 'message/rfc822' NOT NULL,
	"created_issue_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbound_email_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"asset_id" uuid,
	"filename" text,
	"content_type" text DEFAULT 'application/octet-stream' NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'stored' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "background_jobs" ADD CONSTRAINT "background_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD CONSTRAINT "inbound_email_mailboxes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_mailboxes" ADD CONSTRAINT "inbound_email_mailboxes_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_rules" ADD CONSTRAINT "inbound_email_rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_rules" ADD CONSTRAINT "inbound_email_rules_mailbox_id_inbound_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."inbound_email_mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_rules" ADD CONSTRAINT "inbound_email_rules_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD CONSTRAINT "inbound_email_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD CONSTRAINT "inbound_email_messages_mailbox_id_inbound_email_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."inbound_email_mailboxes"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_messages" ADD CONSTRAINT "inbound_email_messages_created_issue_id_issues_id_fk" FOREIGN KEY ("created_issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_attachments" ADD CONSTRAINT "inbound_email_attachments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_attachments" ADD CONSTRAINT "inbound_email_attachments_message_id_inbound_email_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."inbound_email_messages"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbound_email_attachments" ADD CONSTRAINT "inbound_email_attachments_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "background_jobs_company_status_run_after_idx" ON "background_jobs" USING btree ("company_id","status","run_after");
--> statement-breakpoint
CREATE INDEX "background_jobs_kind_status_run_after_idx" ON "background_jobs" USING btree ("kind","status","run_after");
--> statement-breakpoint
CREATE INDEX "background_jobs_locked_at_idx" ON "background_jobs" USING btree ("locked_at");
--> statement-breakpoint
CREATE INDEX "background_jobs_dedupe_idx" ON "background_jobs" USING btree ("company_id","kind","dedupe_key");
--> statement-breakpoint
CREATE INDEX "inbound_email_mailboxes_company_idx" ON "inbound_email_mailboxes" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "inbound_email_mailboxes_enabled_poll_idx" ON "inbound_email_mailboxes" USING btree ("enabled","last_poll_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_mailboxes_company_name_uq" ON "inbound_email_mailboxes" USING btree ("company_id","name");
--> statement-breakpoint
CREATE INDEX "inbound_email_rules_company_mailbox_idx" ON "inbound_email_rules" USING btree ("company_id","mailbox_id");
--> statement-breakpoint
CREATE INDEX "inbound_email_rules_enabled_idx" ON "inbound_email_rules" USING btree ("enabled");
--> statement-breakpoint
CREATE INDEX "inbound_email_messages_company_mailbox_status_idx" ON "inbound_email_messages" USING btree ("company_id","mailbox_id","status");
--> statement-breakpoint
CREATE INDEX "inbound_email_messages_company_created_idx" ON "inbound_email_messages" USING btree ("company_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_messages_company_raw_sha_uq" ON "inbound_email_messages" USING btree ("company_id","raw_sha256");
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_messages_mailbox_provider_uid_uq" ON "inbound_email_messages" USING btree ("mailbox_id","provider_uid") WHERE "provider_uid" is not null;
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_messages_company_message_id_uq" ON "inbound_email_messages" USING btree ("company_id","message_id") WHERE "message_id" is not null;
--> statement-breakpoint
CREATE INDEX "inbound_email_attachments_company_message_idx" ON "inbound_email_attachments" USING btree ("company_id","message_id");
--> statement-breakpoint
CREATE INDEX "inbound_email_attachments_asset_idx" ON "inbound_email_attachments" USING btree ("asset_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "inbound_email_attachments_message_sha_uq" ON "inbound_email_attachments" USING btree ("message_id","sha256");
