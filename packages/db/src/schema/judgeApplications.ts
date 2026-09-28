import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";
import { users } from "./users";

export const JUDGE_APPLICATION_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revoked",
] as const;
export type JudgeApplicationStatus =
  (typeof JUDGE_APPLICATION_STATUSES)[number];

export const judgeApplicationStatus = pgEnum(
  "judge_application_status",
  JUDGE_APPLICATION_STATUSES,
);

export const judgeApplications = pgTable(
  "judge_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    rationale: text("rationale"),
    attachmentName: text("attachment_name"),
    attachmentPath: text("attachment_path"),
    attachmentSize: integer("attachment_size"),
    attachmentContentType: text("attachment_content_type"),
    status: judgeApplicationStatus("status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedBy: uuid("decided_by").references(() => users.id, {
      onDelete: "set null",
    }),
    decisionNote: text("decision_note"),
  },
  (t) => [
    uniqueIndex("judge_applications_event_user_unique").on(t.eventId, t.userId),
    index("judge_applications_event_idx").on(t.eventId),
    index("judge_applications_user_idx").on(t.userId),
  ],
);