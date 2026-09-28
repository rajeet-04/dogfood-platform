CREATE TABLE "voting_credential_rate_limits" (
	"event_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"action" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "voting_credential_rate_limits_count_positive" CHECK ("voting_credential_rate_limits"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "voting_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"access_mode" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "voting_credentials_mode_check" CHECK ("voting_credentials"."access_mode" in ('OPEN_LINK', 'EMAIL_GATED'))
);
--> statement-breakpoint
ALTER TABLE "voting_configs" DROP CONSTRAINT "voting_configs_authenticated_only";--> statement-breakpoint
DROP INDEX "votes_event_voter_unique";--> statement-breakpoint
ALTER TABLE "votes" ALTER COLUMN "voter_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "credential_id" uuid;--> statement-breakpoint
ALTER TABLE "voting_credential_rate_limits" ADD CONSTRAINT "voting_credential_rate_limits_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voting_credential_rate_limits" ADD CONSTRAINT "voting_credential_rate_limits_credential_id_voting_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."voting_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voting_credentials" ADD CONSTRAINT "voting_credentials_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voting_credentials" ADD CONSTRAINT "voting_credentials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "voting_credential_rate_limits_bucket_unique" ON "voting_credential_rate_limits" USING btree ("event_id","credential_id","action","window_start");--> statement-breakpoint
CREATE INDEX "voting_credentials_event_created_idx" ON "voting_credentials" USING btree ("event_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "voting_credentials_token_hash_unique" ON "voting_credentials" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_credential_id_voting_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."voting_credentials"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_event_credential_unique" ON "votes" USING btree ("event_id","credential_id") WHERE "votes"."credential_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "votes_event_voter_unique" ON "votes" USING btree ("event_id","voter_id") WHERE "votes"."voter_id" is not null;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_one_voter_identity_check" CHECK (("votes"."voter_id" is not null and "votes"."credential_id" is null) or ("votes"."voter_id" is null and "votes"."credential_id" is not null));--> statement-breakpoint
ALTER TABLE "voting_configs" ADD CONSTRAINT "voting_configs_access_mode_check" CHECK ("voting_configs"."access_mode" in ('AUTHENTICATED', 'OPEN_LINK', 'EMAIL_GATED'));