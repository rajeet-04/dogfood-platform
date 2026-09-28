import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { events } from "./events";
import { projects } from "./projects";
import { users } from "./users";

export const votingConfigs = pgTable("voting_configs", {
  eventId: uuid("event_id").primaryKey().references(() => events.id, { onDelete: "cascade" }),
  accessMode: text("access_mode").notNull().default("AUTHENTICATED"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  updatedBy: uuid("updated_by").notNull().references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check("voting_configs_authenticated_only", sql`${t.accessMode} = 'AUTHENTICATED'`)]);

export const votes = pgTable("votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  voterId: uuid("voter_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("votes_event_voter_unique").on(t.eventId, t.voterId),
  index("votes_event_project_idx").on(t.eventId, t.projectId),
]);

export const projectComments = pgTable("project_comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("project_comments_project_created_idx").on(t.projectId, t.createdAt),
  index("project_comments_event_author_created_idx").on(t.eventId, t.authorId, t.createdAt),
]);

export const votingRateLimits = pgTable("voting_rate_limits", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  action: text("action").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(1),
}, (t) => [
  uniqueIndex("voting_rate_limits_bucket_unique").on(t.eventId, t.actorId, t.action, t.windowStart),
  check("voting_rate_limits_count_positive", sql`${t.count} > 0`),
]);
