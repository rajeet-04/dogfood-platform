import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";
import { projects } from "./projects";
import { users } from "./users";

export const judgeAssignmentState = pgEnum("judge_assignment_state", [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
]);

export const judgeAssignments = pgTable(
  "judge_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: judgeAssignmentState("status").notNull().default("ASSIGNED"),
    assignedBy: uuid("assigned_by")
      .notNull()
      .references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("judge_assignments_event_judge_project_unique").on(
      t.eventId,
      t.judgeId,
      t.projectId,
    ),
    index("judge_assignments_event_judge_status_idx").on(
      t.eventId,
      t.judgeId,
      t.status,
    ),
    index("judge_assignments_event_project_status_idx").on(
      t.eventId,
      t.projectId,
      t.status,
    ),
  ],
);

export const judgeTrackScopes = pgTable(
  "judge_track_scopes",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    judgeId: uuid("judge_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    trackId: uuid("track_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.judgeId, t.trackId] }),
  ],
);