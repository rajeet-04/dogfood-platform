CREATE TABLE "event_prizes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"track_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"amount" text,
	"currency" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_prizes" ADD CONSTRAINT "event_prizes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_prizes" ADD CONSTRAINT "event_prizes_track_id_event_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."event_tracks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_prizes_event_order_idx" ON "event_prizes" USING btree ("event_id","sort_order");--> statement-breakpoint
CREATE INDEX "event_prizes_track_idx" ON "event_prizes" USING btree ("track_id");