CREATE TABLE "payment_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"method" text NOT NULL,
	"account_label" text NOT NULL,
	"owner_name" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"calendar_item_id" uuid,
	"payment_profile_id" uuid,
	"title" text NOT NULL,
	"provider_name" text,
	"due_date" date,
	"expected_amount_cents" integer,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"paid_amount_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_entry_id" uuid NOT NULL,
	"payment_profile_id" uuid,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"proof_url" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_items" ADD COLUMN "payment_profile_id" uuid;
--> statement-breakpoint
ALTER TABLE "payment_profiles" ADD CONSTRAINT "payment_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_calendar_item_id_calendar_items_id_fk" FOREIGN KEY ("calendar_item_id") REFERENCES "public"."calendar_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_entries" ADD CONSTRAINT "payment_entries_payment_profile_id_payment_profiles_id_fk" FOREIGN KEY ("payment_profile_id") REFERENCES "public"."payment_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_payment_entry_id_payment_entries_id_fk" FOREIGN KEY ("payment_entry_id") REFERENCES "public"."payment_entries"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_payment_profile_id_payment_profiles_id_fk" FOREIGN KEY ("payment_profile_id") REFERENCES "public"."payment_profiles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "payment_profiles_company_active_idx" ON "payment_profiles" USING btree ("company_id","active");
--> statement-breakpoint
CREATE INDEX "payment_profiles_company_method_idx" ON "payment_profiles" USING btree ("company_id","method");
--> statement-breakpoint
CREATE INDEX "payment_entries_company_status_due_idx" ON "payment_entries" USING btree ("company_id","status","due_date");
--> statement-breakpoint
CREATE INDEX "payment_entries_company_calendar_idx" ON "payment_entries" USING btree ("company_id","calendar_item_id");
--> statement-breakpoint
CREATE INDEX "payment_entries_company_profile_idx" ON "payment_entries" USING btree ("company_id","payment_profile_id");
--> statement-breakpoint
CREATE INDEX "payment_records_company_entry_idx" ON "payment_records" USING btree ("company_id","payment_entry_id");
--> statement-breakpoint
CREATE INDEX "payment_records_company_paid_at_idx" ON "payment_records" USING btree ("company_id","paid_at");
--> statement-breakpoint
CREATE INDEX "payment_records_company_profile_idx" ON "payment_records" USING btree ("company_id","payment_profile_id");
