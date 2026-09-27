import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { events } from "./events";
import { users } from "./users";

export const rankingSnapshots = pgTable(
  "ranking_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    scoringVersion: text("scoring_version").notNull(),
    normalizationVersion: text("normalization_version").notNull(),
    rankingVersion: text("ranking_version").notNull(),
    configuration: jsonb("configuration")
      .notNull()
      .$type<Record<string, unknown>>(),
    results: jsonb("results").notNull().$type<Record<string, unknown>>(),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (t) => [
    index("ranking_snapshots_event_generated_idx").on(
      t.eventId,
      t.generatedAt,
    ),
  ],
);