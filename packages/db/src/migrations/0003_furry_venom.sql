CREATE TYPE "public"."judge_assignment_state" AS ENUM('ASSIGNED', 'IN_PROGRESS', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "judge_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"status" "judge_assignment_state" DEFAULT 'ASSIGNED' NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_track_scopes" (
	"event_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"track_id" uuid NOT NULL,
	CONSTRAINT "judge_track_scopes_event_id_judge_id_track_id_pk" PRIMARY KEY("event_id","judge_id","track_id")
);
--> statement-breakpoint
CREATE TABLE "rubric_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rubric_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"weight" numeric(10, 5) NOT NULL,
	"min_score" numeric(10, 3) NOT NULL,
	"max_score" numeric(10, 3) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "judge_assignments" ADD CONSTRAINT "judge_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_assignments" ADD CONSTRAINT "judge_assignments_judge_id_users_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_assignments" ADD CONSTRAINT "judge_assignments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_assignments" ADD CONSTRAINT "judge_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_track_scopes" ADD CONSTRAINT "judge_track_scopes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_track_scopes" ADD CONSTRAINT "judge_track_scopes_judge_id_users_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criteria" ADD CONSTRAINT "rubric_criteria_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubrics" ADD CONSTRAINT "rubrics_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "judge_assignments_event_judge_project_unique" ON "judge_assignments" USING btree ("event_id","judge_id","project_id");--> statement-breakpoint
CREATE INDEX "judge_assignments_event_judge_status_idx" ON "judge_assignments" USING btree ("event_id","judge_id","status");--> statement-breakpoint
CREATE INDEX "judge_assignments_event_project_status_idx" ON "judge_assignments" USING btree ("event_id","project_id","status");--> statement-breakpoint
CREATE INDEX "rubric_criteria_rubric_sort_idx" ON "rubric_criteria" USING btree ("rubric_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "rubrics_event_version_unique" ON "rubrics" USING btree ("event_id","version");