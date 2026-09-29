import {
  AnyPgColumn,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";
import { users } from "./users";

export const judgeParticipationRecords = pgTable(
  "judge_participation_records",
  {
    id: uuid("id").primaryKey(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    payloadHash: text("payload_hash").notNull(),
    algorithm: text("algorithm").notNull(),
    publicKey: text("public_key").notNull(),
    keyFingerprint: text("key_fingerprint").notNull(),
    signature: text("signature").notNull(),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersedesRecordId: uuid("supersedes_record_id").references(
      (): AnyPgColumn => judgeParticipationRecords.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    index("judge_participation_records_event_published_idx").on(
      t.eventId,
      t.publishedAt,
    ),
    index("judge_participation_records_event_judge_issued_idx").on(
      t.eventId,
      t.judgeId,
      t.issuedAt,
    ),
    uniqueIndex("judge_participation_records_supersedes_unique").on(
      t.supersedesRecordId,
    ),
  ],
);

export const judgeParticipationRecordRevocations = pgTable(
  "judge_participation_record_revocations",
  {
    recordId: uuid("record_id")
      .primaryKey()
      .references(() => judgeParticipationRecords.id, { onDelete: "restrict" }),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    revokedBy: uuid("revoked_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason").notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    payloadHash: text("payload_hash").notNull(),
    algorithm: text("algorithm").notNull(),
    publicKey: text("public_key").notNull(),
    keyFingerprint: text("key_fingerprint").notNull(),
    signature: text("signature").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("judge_participation_record_revocations_event_idx").on(t.eventId, t.revokedAt)],
);
