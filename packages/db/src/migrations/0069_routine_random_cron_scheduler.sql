ALTER TABLE "routine_triggers" ADD COLUMN "allowed_weekdays" integer[];
--> statement-breakpoint
ALTER TABLE "routine_triggers" ADD COLUMN "min_time_of_day_min" integer;
--> statement-breakpoint
ALTER TABLE "routine_triggers" ADD COLUMN "max_time_of_day_min" integer;
--> statement-breakpoint
ALTER TABLE "routine_triggers" ADD COLUMN "min_days_ahead" integer;
--> statement-breakpoint
ALTER TABLE "routine_triggers" ADD COLUMN "max_days_ahead" integer;
