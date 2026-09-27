CREATE TYPE "public"."project_state" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "project_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"title" text NOT NULL,
	"tagline" text,
	"description" text NOT NULL,
	"repository_url" text,
	"live_url" text,
	"demo_video_url" text,
	"thumbnail_asset_id" uuid,
	"track_id" uuid,
	"tech_tags" jsonb NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"state" "project_state" DEFAULT 'DRAFT' NOT NULL,
	"current_revision_id" uuid,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_revisions_project_number_unique" ON "project_revisions" USING btree ("project_id","revision_number");--> statement-breakpoint
CREATE INDEX "project_revisions_project_number_desc_idx" ON "project_revisions" USING btree ("project_id","revision_number" desc);--> statement-breakpoint
CREATE UNIQUE INDEX "projects_event_team_unique" ON "projects" USING btree ("event_id","team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_event_slug_unique" ON "projects" USING btree ("event_id","slug");--> statement-breakpoint
CREATE INDEX "projects_event_state_idx" ON "projects" USING btree ("event_id","state");