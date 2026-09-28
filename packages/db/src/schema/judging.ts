import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { events } from "./events";
import { projects } from "./projects";
import { rubrics, rubricCriteria } from "./rubrics";
import { users } from "./users";

export const judgeAssignmentState = pgEnum("judge_assignment_state", [
  "ASSIGNED",
  "IN_PROGRESS",
  "SUBMITTED",
  "LOCKED",
]);

export const evaluationState = pgEnum("evaluation_state", [
  "IN_PROGRESS",
  "SUBMITTED",
  "LOCKED",
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

export const judgeRecusals = pgTable(
  "judge_recusals",
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
    reason: text("reason").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("judge_recusals_event_judge_project_unique").on(
      t.eventId,
      t.judgeId,
      t.projectId,
    ),
    index("judge_recusals_event_idx").on(t.eventId),
  ],
);

export const evaluations = pgTable(
  "evaluations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => judgeAssignments.id, { onDelete: "cascade" }),
    rubricId: uuid("rubric_id")
      .notNull()
      .references(() => rubrics.id, { onDelete: "restrict" }),
    state: evaluationState("state").notNull().default("IN_PROGRESS"),
    currentRevision: integer("current_revision").notNull().default(0),
    overallComment: text("overall_comment"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("evaluations_assignment_unique").on(t.assignmentId),
    index("evaluations_state_idx").on(t.state),
  ],
);

export const evaluationScores = pgTable(
  "evaluation_scores",
  {
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    criterionId: uuid("criterion_id")
      .notNull()
      .references(() => rubricCriteria.id, {
        onDelete: "cascade",
      }),
    score: numeric("score", { precision: 10, scale: 3 }).notNull(),
    comment: text("comment"),
  },
  (t) => [
    primaryKey({ columns: [t.evaluationId, t.criterionId] }),
  ],
);

export const evaluationRevisions = pgTable(
  "evaluation_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    evaluationId: uuid("evaluation_id")
      .notNull()
      .references(() => evaluations.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    scoresJson: jsonb("scores_json").notNull().$type<
      Array<{ criterionId: string; score: number; comment: string | null }>
    >(),
    overallComment: text("overall_comment"),
    changedBy: uuid("changed_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("evaluation_revisions_evaluation_number_unique").on(
      t.evaluationId,
      t.revisionNumber,
    ),
  ],
);
