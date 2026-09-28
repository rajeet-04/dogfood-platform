CREATE TABLE IF NOT EXISTS "judge_recusals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE RESTRICT,
	"judge_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "judge_recusals_event_judge_project_unique"
	ON "judge_recusals" ("event_id", "judge_id", "project_id");
CREATE INDEX IF NOT EXISTS "judge_recusals_event_idx"
	ON "judge_recusals" ("event_id");
