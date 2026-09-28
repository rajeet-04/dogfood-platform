import {
  desc,
} from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  primaryKey,
} from "drizzle-orm/pg-core";

import { assets } from "./assets";
import { events, eventTracks, type CustomQuestion } from "./events";
import { teams } from "./teams";
import { users } from "./users";

export const projectState = pgEnum("project_state", [
  "DRAFT",
  "SUBMITTED",
  "LOCKED",
]);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "restrict" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    state: projectState("state").notNull().default("DRAFT"),
    currentRevisionId: uuid("current_revision_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("projects_event_team_unique").on(t.eventId, t.teamId),
    uniqueIndex("projects_event_slug_unique").on(t.eventId, t.slug),
    index("projects_event_state_idx").on(t.eventId, t.state),
  ],
);

export const projectRevisions = pgTable(
  "project_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    revisionNumber: integer("revision_number").notNull(),
    title: text("title").notNull(),
    tagline: text("tagline"),
    description: text("description").notNull(),
    repositoryUrl: text("repository_url"),
    liveUrl: text("live_url"),
    demoVideoUrl: text("demo_video_url"),
    thumbnailAssetId: uuid("thumbnail_asset_id").references(() => assets.id, { onDelete: "set null" }),
    trackId: uuid("track_id").references(() => eventTracks.id, { onDelete: "set null" }),
    techTags: jsonb("tech_tags")
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
    customAnswers: jsonb("custom_answers")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    questionSnapshot: jsonb("question_snapshot")
      .$type<CustomQuestion[]>()
      .notNull()
      .default([]),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("project_revisions_project_number_unique").on(
      t.projectId,
      t.revisionNumber,
    ),
    index("project_revisions_project_number_desc_idx").on(
      t.projectId,
      desc(t.revisionNumber),
    ),
  ],
);

export const projectRevisionImages = pgTable(
  "project_revision_images",
  {
    revisionId: uuid("revision_id")
      .notNull()
      .references(() => projectRevisions.id, { onDelete: "cascade" }),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.revisionId, t.assetId] }),
    uniqueIndex("project_revision_images_position_unique").on(t.revisionId, t.position),
    index("project_revision_images_asset_idx").on(t.assetId),
  ],
);
