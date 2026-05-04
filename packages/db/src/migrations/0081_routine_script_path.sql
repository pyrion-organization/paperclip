ALTER TABLE "routines" DROP COLUMN "script_body";
--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "script_path" text;
