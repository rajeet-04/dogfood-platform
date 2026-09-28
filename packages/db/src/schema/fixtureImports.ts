import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { events } from "./events";

export const fixtureImportAnomalies = pgTable(
  "fixture_import_anomalies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    sourceProjectId: text("source_project_id").notNull(),
    canonicalSourceProjectId: text("canonical_source_project_id").notNull(),
    projectRecord: jsonb("project_record").notNull().$type<Record<string, unknown>>(),
    scoreRecords: jsonb("score_records").notNull().$type<Array<Record<string, unknown>>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fixture_anomalies_event_source_unique").on(t.eventId, t.sourceProjectId)],
);
