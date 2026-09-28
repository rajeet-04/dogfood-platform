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
} from "drizzle-orm/pg-core";

import { events } from "./events";
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
    thumbnailAssetId: uuid("thumbnail_asset_id"),
    trackId: uuid("track_id"),
    techTags: jsonb("tech_tags")
      .$type<string[]>()
      .notNull()
      .$defaultFn(() => []),
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