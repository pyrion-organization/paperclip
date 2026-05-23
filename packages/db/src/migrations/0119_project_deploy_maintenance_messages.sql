ALTER TABLE "project_deployment_targets" ADD COLUMN "maintenance_updates_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_deployment_targets" ADD COLUMN "maintenance_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD COLUMN "maintenance_message_status" text;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD COLUMN "maintenance_message_recipients" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD COLUMN "maintenance_message_attempted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD COLUMN "maintenance_message_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "project_deploy_events" ADD COLUMN "maintenance_message_error" text;
