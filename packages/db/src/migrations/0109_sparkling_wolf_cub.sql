CREATE TABLE "calendar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"risk_level" text DEFAULT 'medium' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"provider_name" text,
	"related_client_id" uuid,
	"related_project_id" uuid,
	"due_date" date,
	"due_time" text,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"recurrence_type" text DEFAULT 'none' NOT NULL,
	"recurrence_rule" text,
	"next_due_date" date,
	"amount_cents" integer,
	"currency" text DEFAULT 'USD' NOT NULL,
	"auto_renew" boolean DEFAULT false NOT NULL,
	"manual_action_required" boolean DEFAULT true NOT NULL,
	"payment_method_label" text,
	"payment_owner" text,
	"cost_center" text,
	"purchase_email" text,
	"account_login_email" text,
	"billing_email" text,
	"recovery_email" text,
	"technical_contact_email" text,
	"service_url" text,
	"login_url" text,
	"billing_url" text,
	"documentation_url" text,
	"source_kind" text DEFAULT 'manual' NOT NULL,
	"source_email_message_id" uuid,
	"confidence_score" integer,
	"metadata" jsonb,
	"notes" text,
	"internal_notes" text,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"updated_by_agent_id" uuid,
	"updated_by_user_id" text,
	"last_checked_at" timestamp with time zone,
	"last_reminder_scanned_at" timestamp with time zone,
	"last_metadata_scanned_at" timestamp with time zone,
	"last_completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_item_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"calendar_item_id" uuid NOT NULL,
	"document_type" text DEFAULT 'other' NOT NULL,
	"document_id" uuid,
	"asset_id" uuid,
	"source_email_message_id" uuid,
	"source_email_attachment_id" uuid,
	"title" text,
	"url" text,
	"notes" text,
	"metadata" jsonb,
	"created_by_agent_id" uuid,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_related_client_id_clients_id_fk" FOREIGN KEY ("related_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_related_project_id_projects_id_fk" FOREIGN KEY ("related_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_source_email_message_id_inbound_email_messages_id_fk" FOREIGN KEY ("source_email_message_id") REFERENCES "public"."inbound_email_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD CONSTRAINT "calendar_items_updated_by_agent_id_agents_id_fk" FOREIGN KEY ("updated_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_calendar_item_id_calendar_items_id_fk" FOREIGN KEY ("calendar_item_id") REFERENCES "public"."calendar_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_source_email_message_id_inbound_email_messages_id_fk" FOREIGN KEY ("source_email_message_id") REFERENCES "public"."inbound_email_messages"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_source_email_attachment_id_inbound_email_attachments_id_fk" FOREIGN KEY ("source_email_attachment_id") REFERENCES "public"."inbound_email_attachments"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "calendar_item_documents" ADD CONSTRAINT "calendar_item_documents_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "calendar_items_company_status_idx" ON "calendar_items" USING btree ("company_id","status");
--> statement-breakpoint
CREATE INDEX "calendar_items_company_due_idx" ON "calendar_items" USING btree ("company_id","next_due_date");
--> statement-breakpoint
CREATE INDEX "calendar_items_company_category_idx" ON "calendar_items" USING btree ("company_id","category");
--> statement-breakpoint
CREATE INDEX "calendar_items_company_risk_idx" ON "calendar_items" USING btree ("company_id","risk_level");
--> statement-breakpoint
CREATE INDEX "calendar_items_company_source_email_idx" ON "calendar_items" USING btree ("company_id","source_email_message_id");
--> statement-breakpoint
CREATE INDEX "calendar_items_company_provider_idx" ON "calendar_items" USING btree ("company_id","provider_name");
--> statement-breakpoint
CREATE INDEX "calendar_item_documents_company_item_idx" ON "calendar_item_documents" USING btree ("company_id","calendar_item_id");
--> statement-breakpoint
CREATE INDEX "calendar_item_documents_company_type_idx" ON "calendar_item_documents" USING btree ("company_id","document_type");
--> statement-breakpoint
CREATE INDEX "calendar_item_documents_document_idx" ON "calendar_item_documents" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX "calendar_item_documents_asset_idx" ON "calendar_item_documents" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX "calendar_item_documents_source_email_attachment_idx" ON "calendar_item_documents" USING btree ("source_email_attachment_id");
