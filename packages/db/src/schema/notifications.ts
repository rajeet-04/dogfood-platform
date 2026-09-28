import { index, text, timestamp, uuid, pgTable } from "drizzle-orm/pg-core";

import { events } from "./events";
import { users } from "./users";

export const NOTIFICATION_TYPES = [
  "judge_application_approved",
  "judge_application_rejected",
  "judge_application_received",
  "judge_added",
  "judge_removed",
  "role_changed",
  "results_published",
  "project_submitted",
  "event_state_changed",
  "certificate_issued",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, {
      onDelete: "cascade",
    }),
    type: text("type").notNull().$type<NotificationType>(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
    index("notifications_user_unread_idx").on(t.userId, t.readAt),
  ],
);
