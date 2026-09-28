import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { events } from "./events";
import { projects } from "./projects";
import { users } from "./users";

/** Latest preference for one assigned judge and unordered project pair. */
export const pairwiseComparisons = pgTable(
  "pairwise_comparisons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    judgeId: uuid("judge_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    projectAId: uuid("project_a_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    projectBId: uuid("project_b_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    winnerProjectId: uuid("winner_project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pairwise_comparisons_judge_pair_unique").on(t.eventId, t.judgeId, t.projectAId, t.projectBId),
    index("pairwise_comparisons_event_judge_idx").on(t.eventId, t.judgeId),
    check("pairwise_comparisons_distinct_projects", sql`${t.projectAId} <> ${t.projectBId}`),
    check("pairwise_comparisons_winner_in_pair", sql`${t.winnerProjectId} = ${t.projectAId} OR ${t.winnerProjectId} = ${t.projectBId}`),
  ],
);

/** Reproducible pairwise calculation; publication only adds a timestamp. */
export const pairwiseRankingSnapshots = pgTable(
  "pairwise_ranking_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "restrict" }),
    algorithmVersion: text("algorithm_version").notNull(),
    configuration: jsonb("configuration").notNull().$type<Record<string, unknown>>(),
    input: jsonb("input").notNull().$type<Record<string, unknown>>(),
    results: jsonb("results").notNull().$type<Record<string, unknown>>(),
    generatedBy: uuid("generated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    supersedesSnapshotId: uuid("supersedes_snapshot_id"),
  },
  (t) => [
    index("pairwise_ranking_snapshots_event_generated_idx").on(t.eventId, t.generatedAt),
    index("pairwise_ranking_snapshots_event_published_idx").on(t.eventId, t.publishedAt),
  ],
);
