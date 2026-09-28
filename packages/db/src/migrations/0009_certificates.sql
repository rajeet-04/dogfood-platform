CREATE TABLE IF NOT EXISTS "certificates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"project_title" text NOT NULL,
	"team_name" text,
	"tier" text NOT NULL,
	"rank" integer,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by" uuid
);--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE set null;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE restrict;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE set null;--> statement-breakpoint
CREATE UNIQUE INDEX "certificates_event_user_unique" ON "certificates" USING btree ("event_id","user_id");--> statement-breakpoint
CREATE INDEX "certificates_event_id_idx" ON "certificates" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "certificates_user_idx" ON "certificates" USING btree ("user_id");