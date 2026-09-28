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
}, (t) => [check("voting_configs_access_mode_check", sql`${t.accessMode} in ('AUTHENTICATED', 'OPEN_LINK', 'EMAIL_GATED')`)]);

export const votingCredentials = pgTable("voting_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  accessMode: text("access_mode").notNull(),
  tokenHash: text("token_hash").notNull(),
  email: text("email"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (t) => [
  check("voting_credentials_mode_check", sql`${t.accessMode} in ('OPEN_LINK', 'EMAIL_GATED')`),
  index("voting_credentials_event_created_idx").on(t.eventId, t.createdAt),
  uniqueIndex("voting_credentials_token_hash_unique").on(t.tokenHash),
  uniqueIndex("voting_credentials_active_event_email_unique").on(t.eventId, t.email).where(sql`${t.email} is not null and ${t.revokedAt} is null`),
]);

export const votes = pgTable("votes", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  voterId: uuid("voter_id").references(() => users.id, { onDelete: "restrict" }),
  credentialId: uuid("credential_id").references(() => votingCredentials.id, { onDelete: "restrict" }),
  voterTokenHash: text("voter_token_hash"),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("votes_one_voter_identity_check", sql`(case when ${t.voterId} is not null then 1 else 0 end + case when ${t.credentialId} is not null then 1 else 0 end + case when ${t.voterTokenHash} is not null then 1 else 0 end) = 1`),
  uniqueIndex("votes_event_voter_unique").on(t.eventId, t.voterId).where(sql`${t.voterId} is not null`),
  uniqueIndex("votes_event_credential_unique").on(t.eventId, t.credentialId).where(sql`${t.credentialId} is not null`),
  uniqueIndex("votes_event_voter_token_unique").on(t.eventId, t.voterTokenHash).where(sql`${t.voterTokenHash} is not null`),
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

export const votingCredentialRateLimits = pgTable("voting_credential_rate_limits", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  credentialId: uuid("credential_id").references(() => votingCredentials.id, { onDelete: "cascade" }),
  voterTokenHash: text("voter_token_hash"),
  action: text("action").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(1),
}, (t) => [
  check("voting_credential_rate_limits_identity_check", sql`(${t.credentialId} is not null and ${t.voterTokenHash} is null) or (${t.credentialId} is null and ${t.voterTokenHash} is not null)`),
  uniqueIndex("voting_credential_rate_limits_bucket_unique").on(t.eventId, t.credentialId, t.action, t.windowStart).where(sql`${t.credentialId} is not null`),
  uniqueIndex("voting_token_rate_limits_bucket_unique").on(t.eventId, t.voterTokenHash, t.action, t.windowStart).where(sql`${t.voterTokenHash} is not null`),
  check("voting_credential_rate_limits_count_positive", sql`${t.count} > 0`),
]);

export const votingAbuseRateLimits = pgTable("voting_abuse_rate_limits", {
  eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  action: text("action").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(1),
}, (t) => [
  check("voting_abuse_rate_limits_scope_check", sql`${t.scope} in ('EVENT', 'NETWORK')`),
  check("voting_abuse_rate_limits_count_positive", sql`${t.count} > 0`),
  uniqueIndex("voting_abuse_rate_limits_bucket_unique").on(t.eventId, t.scope, t.keyHash, t.action, t.windowStart),
  index("voting_abuse_rate_limits_event_window_idx").on(t.eventId, t.windowStart),
]);
