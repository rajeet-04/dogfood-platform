CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "prize_info" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "timeline" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "schedule" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "rules" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "max_team_size" integer;--> statement-breakpoint
ALTER TABLE "judge_applications" ADD COLUMN "attachment_name" text;--> statement-breakpoint
ALTER TABLE "judge_applications" ADD COLUMN "attachment_path" text;--> statement-breakpoint
ALTER TABLE "judge_applications" ADD COLUMN "attachment_size" integer;--> statement-breakpoint
ALTER TABLE "judge_applications" ADD COLUMN "attachment_content_type" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_unread_idx" ON "notifications" USING btree ("user_id","read_at");