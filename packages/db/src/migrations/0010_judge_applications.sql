CREATE TYPE "judge_application_status" AS ENUM ('pending','approved','rejected','revoked');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "judge_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"rationale" text,
	"status" "judge_application_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_note" text
);--> statement-breakpoint
ALTER TABLE "judge_applications" ADD CONSTRAINT "judge_applications_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "judge_applications" ADD CONSTRAINT "judge_applications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "judge_applications" ADD CONSTRAINT "judge_applications_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX "judge_applications_event_user_unique" ON "judge_applications" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "judge_applications_event_idx" ON "judge_applications" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "judge_applications_user_idx" ON "judge_applications" USING btree ("user_id");