ALTER TABLE "companies" ADD COLUMN "email_signature_html" text;--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "email_template_brand_name";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "email_template_tagline";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "email_template_website_url";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "email_template_footer_text";
