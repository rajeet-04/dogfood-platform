import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";
import { users } from "./users";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_event_created_idx").on(t.eventId, t.createdAt),
    index("audit_events_event_actor_created_idx").on(
      t.eventId,
      t.actorId,
      t.createdAt,
    ),
  ],
);