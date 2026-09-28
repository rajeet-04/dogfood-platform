CREATE TABLE "fixture_import_anomalies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"source_project_id" text NOT NULL,
	"canonical_source_project_id" text NOT NULL,
	"project_record" jsonb NOT NULL,
	"score_records" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_revision_images" (
	"revision_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "project_revision_images_revision_id_asset_id_pk" PRIMARY KEY("revision_id","asset_id")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "event_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DROP INDEX "teams_event_name_unique";--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "custom_questions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD COLUMN "custom_answers" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD COLUMN "question_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fixture_import_anomalies" ADD CONSTRAINT "fixture_import_anomalies_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revision_images" ADD CONSTRAINT "project_revision_images_revision_id_project_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."project_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revision_images" ADD CONSTRAINT "project_revision_images_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_tracks" ADD CONSTRAINT "event_tracks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fixture_anomalies_event_source_unique" ON "fixture_import_anomalies" USING btree ("event_id","source_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_revision_images_position_unique" ON "project_revision_images" USING btree ("revision_id","position");--> statement-breakpoint
CREATE INDEX "project_revision_images_asset_idx" ON "project_revision_images" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "assets_event_idx" ON "assets" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_tracks_event_name_unique" ON "event_tracks" USING btree ("event_id","name");--> statement-breakpoint
CREATE INDEX "event_tracks_event_order_idx" ON "event_tracks" USING btree ("event_id","sort_order");--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_thumbnail_asset_id_assets_id_fk" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revisions" ADD CONSTRAINT "project_revisions_track_id_event_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."event_tracks"("id") ON DELETE set null ON UPDATE no action;