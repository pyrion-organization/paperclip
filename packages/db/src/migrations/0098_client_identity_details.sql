CREATE TABLE "client_email_domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_projects" ADD COLUMN "project_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "client_email_domains" ADD CONSTRAINT "client_email_domains_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "client_email_domains" ADD CONSTRAINT "client_email_domains_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "client_email_domains_company_idx" ON "client_email_domains" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX "client_email_domains_client_idx" ON "client_email_domains" USING btree ("client_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "client_email_domains_company_domain_unique" ON "client_email_domains" USING btree ("company_id","domain");
