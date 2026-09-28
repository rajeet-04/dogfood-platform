import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { EVENT_ROLES, EVENT_STATES } from "./enums";
import { users } from "./users";

export const eventState = pgEnum("event_state", EVENT_STATES);
export const eventRole = pgEnum("event_role", EVENT_ROLES);

export type CustomQuestion = {
  id: string;
  prompt: string;
  required: boolean;
  visibility: "PUBLIC" | "ORGANIZER_ONLY";
  order: number;
};

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  timezone: text("timezone").notNull(),
  state: eventState("state").notNull().default("DRAFT"),
  registrationOpensAt: timestamp("registration_opens_at", {
    withTimezone: true,
  }),
  registrationClosesAt: timestamp("registration_closes_at", {
    withTimezone: true,
  }),
  submissionOpensAt: timestamp("submission_opens_at", { withTimezone: true }),
  submissionClosesAt: timestamp("submission_closes_at", {
    withTimezone: true,
  }),
  judgingOpensAt: timestamp("judging_opens_at", { withTimezone: true }),
  judgingClosesAt: timestamp("judging_closes_at", { withTimezone: true }),
  websiteUrl: text("website_url"),
  prizeInfo: text("prize_info"),
  timeline: text("timeline"),
  schedule: text("schedule"),
  rules: text("rules"),
  maxTeamSize: integer("max_team_size"),
  customQuestions: jsonb("custom_questions")
    .$type<CustomQuestion[]>()
    .notNull()
    .default([]),
  publishedRankingSnapshotId: uuid("published_ranking_snapshot_id"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventTracks = pgTable(
  "event_tracks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("event_tracks_event_name_unique").on(t.eventId, t.name),
    index("event_tracks_event_order_idx").on(t.eventId, t.sortOrder),
  ],
);

export const eventPrizes = pgTable(
  "event_prizes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    trackId: uuid("track_id").references(() => eventTracks.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    description: text("description"),
    amount: text("amount"),
    currency: text("currency"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("event_prizes_event_order_idx").on(t.eventId, t.sortOrder),
    index("event_prizes_track_idx").on(t.trackId),
  ],
);

export const eventMemberships = pgTable(
  "event_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    role: eventRole("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("event_memberships_event_user_unique").on(t.eventId, t.userId),
    index("event_memberships_user_event_idx").on(t.userId, t.eventId),
    index("event_memberships_event_role_active_idx").on(
      t.eventId,
      t.role,
      t.isActive,
    ),
  ],
);
