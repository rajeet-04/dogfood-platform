CREATE TYPE "public"."evaluation_state" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'LOCKED');--> statement-breakpoint
ALTER TYPE "public"."judge_assignment_state" ADD VALUE 'LOCKED';--> statement-breakpoint
CREATE TABLE "evaluation_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"scores_json" jsonb NOT NULL,
	"overall_comment" text,
	"changed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evaluation_scores" (
	"evaluation_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"score" numeric(10, 3) NOT NULL,
	"comment" text,
	CONSTRAINT "evaluation_scores_evaluation_id_criterion_id_pk" PRIMARY KEY("evaluation_id","criterion_id")
);
--> statement-breakpoint
CREATE TABLE "evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"rubric_id" uuid NOT NULL,
	"state" "evaluation_state" DEFAULT 'IN_PROGRESS' NOT NULL,
	"current_revision" integer DEFAULT 0 NOT NULL,
	"overall_comment" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "evaluation_revisions" ADD CONSTRAINT "evaluation_revisions_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_revisions" ADD CONSTRAINT "evaluation_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_evaluation_id_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_scores" ADD CONSTRAINT "evaluation_scores_criterion_id_rubric_criteria_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."rubric_criteria"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_assignment_id_judge_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."judge_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_rubric_id_rubrics_id_fk" FOREIGN KEY ("rubric_id") REFERENCES "public"."rubrics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "evaluation_revisions_evaluation_number_unique" ON "evaluation_revisions" USING btree ("evaluation_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "evaluations_assignment_unique" ON "evaluations" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "evaluations_state_idx" ON "evaluations" USING btree ("state");