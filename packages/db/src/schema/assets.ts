import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { events } from "./events";
import { users } from "./users";

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
    storageKey: text("storage_key").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assets_event_idx").on(t.eventId)],
);
