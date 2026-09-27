import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";

export const rubrics = pgTable(
  "rubrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    active: boolean("active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("rubrics_event_version_unique").on(t.eventId, t.version)],
);

export const rubricCriteria = pgTable(
  "rubric_criteria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubrics.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    weight: numeric("weight", { precision: 10, scale: 5 }).notNull(),
    minScore: numeric("min_score", { precision: 10, scale: 3 }).notNull(),
    maxScore: numeric("max_score", { precision: 10, scale: 3 }).notNull(),
    isOptional: boolean("is_optional").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("rubric_criteria_rubric_sort_idx").on(t.rubricId, t.sortOrder),
  ],
);