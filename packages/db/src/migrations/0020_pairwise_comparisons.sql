CREATE TABLE "pairwise_comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"project_a_id" uuid NOT NULL,
	"project_b_id" uuid NOT NULL,
	"winner_project_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pairwise_comparisons_distinct_projects" CHECK ("project_a_id" <> "project_b_id"),
	CONSTRAINT "pairwise_comparisons_winner_in_pair" CHECK ("winner_project_id" = "project_a_id" OR "winner_project_id" = "project_b_id")
);
--> statement-breakpoint
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_judge_id_users_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_project_a_id_projects_id_fk" FOREIGN KEY ("project_a_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_project_b_id_projects_id_fk" FOREIGN KEY ("project_b_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "pairwise_comparisons" ADD CONSTRAINT "pairwise_comparisons_winner_project_id_projects_id_fk" FOREIGN KEY ("winner_project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
CREATE UNIQUE INDEX "pairwise_comparisons_judge_pair_unique" ON "pairwise_comparisons" USING btree ("event_id","judge_id","project_a_id","project_b_id");
--> statement-breakpoint
CREATE INDEX "pairwise_comparisons_event_judge_idx" ON "pairwise_comparisons" USING btree ("event_id","judge_id");
