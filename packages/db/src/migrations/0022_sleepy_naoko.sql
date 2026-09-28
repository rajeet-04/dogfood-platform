CREATE TABLE "voting_abuse_rate_limits" (
	"event_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "voting_abuse_rate_limits_scope_check" CHECK ("voting_abuse_rate_limits"."scope" in ('EVENT', 'NETWORK')),
	CONSTRAINT "voting_abuse_rate_limits_count_positive" CHECK ("voting_abuse_rate_limits"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "voting_abuse_rate_limits" ADD CONSTRAINT "voting_abuse_rate_limits_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "voting_abuse_rate_limits_bucket_unique" ON "voting_abuse_rate_limits" USING btree ("event_id", "scope", "key_hash", "action", "window_start");
--> statement-breakpoint
CREATE INDEX "voting_abuse_rate_limits_event_window_idx" ON "voting_abuse_rate_limits" USING btree ("event_id", "window_start");
