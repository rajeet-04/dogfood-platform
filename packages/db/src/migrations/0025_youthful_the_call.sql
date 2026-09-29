ALTER TABLE "judge_participation_record_revocations" ADD COLUMN "payload" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD COLUMN "payload_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD COLUMN "algorithm" text NOT NULL;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD COLUMN "public_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD COLUMN "key_fingerprint" text NOT NULL;--> statement-breakpoint
ALTER TABLE "judge_participation_record_revocations" ADD COLUMN "signature" text NOT NULL;