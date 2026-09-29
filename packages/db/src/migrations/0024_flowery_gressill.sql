CREATE TABLE "judge_participation_record_revocations" (
	"record_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"revoked_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"revoked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "judge_participation_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"judge_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"algorithm" text NOT NULL,
	"public_key" text NOT NULL,
	"key_fingerprint" text NOT NULL,
	"signature" text NOT NULL,
	"issued_by" uuid NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"supersedes_record_id" uuid
);
--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD CONSTRAINT "judge_participation_record_revocations_record_id_judge_participation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."judge_participation_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD CONSTRAINT "judge_participation_record_revocations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD CONSTRAINT "judge_participation_record_revocations_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_participation_records" ADD CONSTRAINT "judge_participation_records_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_participation_records" ADD CONSTRAINT "judge_participation_records_judge_id_users_id_fk" FOREIGN KEY ("judge_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_participation_records" ADD CONSTRAINT "judge_participation_records_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "judge_participation_records" ADD CONSTRAINT "judge_participation_records_supersedes_record_id_judge_participation_records_id_fk" FOREIGN KEY ("supersedes_record_id") REFERENCES "public"."judge_participation_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "judge_participation_record_revocations_event_idx" ON "judge_participation_record_revocations" USING btree ("event_id","revoked_at");--> statement-breakpoint
CREATE INDEX "judge_participation_records_event_published_idx" ON "judge_participation_records" USING btree ("event_id","published_at");--> statement-breakpoint
CREATE INDEX "judge_participation_records_event_judge_issued_idx" ON "judge_participation_records" USING btree ("event_id","judge_id","issued_at");--> statement-breakpoint
CREATE UNIQUE INDEX "judge_participation_records_supersedes_unique" ON "judge_participation_records" USING btree ("supersedes_record_id");
--> statement-breakpoint
CREATE FUNCTION reject_judge_record_ledger_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'judge record ledger rows are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER judge_participation_records_append_only
BEFORE UPDATE OR DELETE ON "judge_participation_records"
FOR EACH ROW EXECUTE FUNCTION reject_judge_record_ledger_mutation();
--> statement-breakpoint
CREATE TRIGGER judge_participation_record_revocations_append_only
BEFORE UPDATE OR DELETE ON "judge_participation_record_revocations"
FOR EACH ROW EXECUTE FUNCTION reject_judge_record_ledger_mutation();
