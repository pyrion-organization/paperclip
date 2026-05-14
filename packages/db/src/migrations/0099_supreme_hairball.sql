CREATE TABLE "client_employee_project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"client_project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"email" text NOT NULL,
	"project_scope" text DEFAULT 'all_linked_projects' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_employee_project_links" ADD CONSTRAINT "client_employee_project_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_employee_project_links" ADD CONSTRAINT "client_employee_project_links_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_employee_project_links" ADD CONSTRAINT "client_employee_project_links_employee_id_client_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."client_employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_employee_project_links" ADD CONSTRAINT "client_employee_project_links_client_project_id_client_projects_id_fk" FOREIGN KEY ("client_project_id") REFERENCES "public"."client_projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_employees" ADD CONSTRAINT "client_employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_employees" ADD CONSTRAINT "client_employees_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_employee_project_links_company_idx" ON "client_employee_project_links" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "client_employee_project_links_client_idx" ON "client_employee_project_links" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "client_employee_project_links_employee_idx" ON "client_employee_project_links" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "client_employee_project_links_client_project_idx" ON "client_employee_project_links" USING btree ("client_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_employee_project_links_employee_project_unique" ON "client_employee_project_links" USING btree ("employee_id","client_project_id");--> statement-breakpoint
CREATE INDEX "client_employees_company_idx" ON "client_employees" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "client_employees_client_idx" ON "client_employees" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_employees_company_client_email_unique" ON "client_employees" USING btree ("company_id","client_id","email");