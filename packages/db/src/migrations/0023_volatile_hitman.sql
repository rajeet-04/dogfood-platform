CREATE TABLE "pairwise_ranking_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"algorithm_version" text NOT NULL,
	"configuration" jsonb NOT NULL,
	"input" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	"generated_by" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"supersedes_snapshot_id" uuid
);
--> statement-breakpoint
ALTER TABLE "pairwise_ranking_snapshots" ADD CONSTRAINT "pairwise_ranking_snapshots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairwise_ranking_snapshots" ADD CONSTRAINT "pairwise_ranking_snapshots_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pairwise_ranking_snapshots_event_generated_idx" ON "pairwise_ranking_snapshots" USING btree ("event_id","generated_at");--> statement-breakpoint
CREATE INDEX "pairwise_ranking_snapshots_event_published_idx" ON "pairwise_ranking_snapshots" USING btree ("event_id","published_at");