import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";
import { projects } from "./projects";
import { users } from "./users";

export const certificates = pgTable(
  "certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    projectId: uuid("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    projectTitle: text("project_title").notNull(),
    teamName: text("team_name"),
    tier: text("tier").notNull(),
    rank: integer("rank"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    issuedBy: uuid("issued_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("certificates_event_user_unique").on(t.eventId, t.userId),
    index("certificates_event_id_idx").on(t.eventId),
    index("certificates_user_idx").on(t.userId),
  ],
);