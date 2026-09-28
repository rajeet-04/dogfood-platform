import { and, db, eq, inArray, schema, sqlState, type CustomQuestion } from "@dogfood/db";
import { appendAuditEvent } from "@dogfood/audit";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError, z } from "@dogfood/validation";

import { buildCsv } from "./csv";

const questionSchema = z.object({
  id: z.string().uuid(),
  prompt: z.string().min(1).max(500),
  required: z.boolean(),
  visibility: z.enum(["PUBLIC", "ORGANIZER_ONLY"]),
  order: z.number().int().nonnegative(),
});

const revisionSchema = z.object({
  id: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  createdAt: z.string().datetime(),
  title: z.string().max(120),
  tagline: z.string().max(280).nullable(),
  description: z.string().max(4_000),
  repositoryUrl: z.string().url().nullable(),
  liveUrl: z.string().url().nullable(),
  demoVideoUrl: z.string().url().nullable(),
  thumbnailAssetId: z.string().uuid().nullable(),
  trackId: z.string().uuid().nullable(),
  techTags: z.array(z.string().max(40)).max(20),
  customAnswers: z.record(z.string().uuid(), z.string().max(4_000)),
  questionSnapshot: z.array(questionSchema).max(100),
  images: z.array(z.object({ assetId: z.string().uuid(), position: z.number().int().nonnegative() })).max(10),
});

const projectSchema = z.object({
  id: z.string().uuid(),
  teamId: z.string().uuid(),
  slug: z.string().min(1).max(120),
  state: z.enum(["DRAFT", "SUBMITTED", "LOCKED"]),
  submittedAt: z.string().datetime().nullable(),
  lockedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  currentRevisionId: z.string().uuid(),
  revisions: z.array(revisionSchema).min(1).max(100),
});

const archiveSchema = z.object({
  format: z.literal("dogfood-projects"),
  version: z.literal(1),
  eventId: z.string().uuid(),
  projects: z.array(projectSchema).max(1_000),
});

export type ProjectArchive = z.infer<typeof archiveSchema>;

const CSV_HEADERS = ["project_id", "team_id", "slug", "state", "submitted_at", "locked_at", "created_at", "current_revision_id", "revisions_json"];

async function requireOrganizer(actor: Actor, eventId: string) {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const memberships = await db.select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(and(eq(schema.eventMemberships.eventId, eventId), eq(schema.eventMemberships.userId, actor.userId), eq(schema.eventMemberships.isActive, true)));
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId,
    resourceEventId: eventId,
    roles: memberships.map(({ role }) => role),
    eventState: event.state,
  });
  return event;
}

export async function exportProjectArchive(actor: Actor, eventId: string): Promise<ProjectArchive> {
  await requireOrganizer(actor, eventId);
  const projects = await db.select().from(schema.projects).where(eq(schema.projects.eventId, eventId)).orderBy(schema.projects.slug);
  const records: ProjectArchive["projects"] = [];
  for (const project of projects) {
    const revisions = await db.select().from(schema.projectRevisions)
      .where(eq(schema.projectRevisions.projectId, project.id)).orderBy(schema.projectRevisions.revisionNumber);
    const entries: ProjectArchive["projects"][number]["revisions"] = [];
    for (const revision of revisions) {
      const images = await db.select({ assetId: schema.projectRevisionImages.assetId, position: schema.projectRevisionImages.position })
        .from(schema.projectRevisionImages).where(eq(schema.projectRevisionImages.revisionId, revision.id)).orderBy(schema.projectRevisionImages.position);
      entries.push({
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        createdAt: revision.createdAt.toISOString(),
        title: revision.title,
        tagline: revision.tagline,
        description: revision.description,
        repositoryUrl: revision.repositoryUrl,
        liveUrl: revision.liveUrl,
        demoVideoUrl: revision.demoVideoUrl,
        thumbnailAssetId: revision.thumbnailAssetId,
        trackId: revision.trackId,
        techTags: revision.techTags,
        customAnswers: revision.customAnswers,
        questionSnapshot: revision.questionSnapshot,
        images,
      });
    }
    if (entries.length === 0 || !project.currentRevisionId) throw new DogfoodError("CONFLICT", `Project ${project.id} has no revision`);
    records.push({
      id: project.id,
      teamId: project.teamId,
      slug: project.slug,
      state: project.state,
      submittedAt: project.submittedAt?.toISOString() ?? null,
      lockedAt: project.lockedAt?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      currentRevisionId: project.currentRevisionId,
      revisions: entries,
    });
  }
  return { format: "dogfood-projects", version: 1, eventId, projects: records };
}

export function projectArchiveCsv(archive: ProjectArchive): string {
  return buildCsv(CSV_HEADERS, archive.projects.map((project) => [
    project.id, project.teamId, project.slug, project.state, project.submittedAt,
    project.lockedAt, project.createdAt, project.currentRevisionId, JSON.stringify(project.revisions),
  ]));
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') { quoted = false; quoteClosed = true; }
      else field += char;
    } else if (quoteClosed && char !== "," && char !== "\n" && char !== "\r") {
      throw new DogfoodError("VALIDATION_FAILED", "Malformed CSV quoting");
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field); field = ""; quoteClosed = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); rows.push(row); row = []; field = ""; quoteClosed = false;
    } else if (char === '"') throw new DogfoodError("VALIDATION_FAILED", "Malformed CSV quoting");
    else field += char;
  }
  if (quoted) throw new DogfoodError("VALIDATION_FAILED", "Unclosed CSV field");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (rows.length === 0 || rows[0]!.join(",") !== CSV_HEADERS.join(",")) {
    throw new DogfoodError("VALIDATION_FAILED", "CSV header does not match the DOGFOOD project archive format");
  }
  return rows.slice(1);
}

export function parseProjectArchiveCsv(text: string, eventId: string): unknown {
  const rows = parseCsv(text);
  if (rows.length > 1_000 || rows.some((row) => row.length !== CSV_HEADERS.length)) {
    throw new DogfoodError("VALIDATION_FAILED", "CSV has an invalid row count or column count");
  }
  try {
    return {
      format: "dogfood-projects",
      version: 1,
      eventId,
      projects: rows.map((row) => ({
        id: row[0], teamId: row[1], slug: row[2], state: row[3], submittedAt: row[4] || null,
        lockedAt: row[5] || null, createdAt: row[6], currentRevisionId: row[7], revisions: JSON.parse(row[8]!),
      })),
    };
  } catch {
    throw new DogfoodError("VALIDATION_FAILED", "CSV contains invalid JSON revision data");
  }
}

export async function importProjectArchive(actor: Actor, eventId: string, input: unknown): Promise<{ imported: number }> {
  const event = await requireOrganizer(actor, eventId);
  if (["JUDGING", "RESULTS_READY", "PUBLISHED", "ARCHIVED"].includes(event.state)) {
    throw new DogfoodError("CONFLICT", "Project archive imports are closed once judging has started");
  }
  const parsed = archiveSchema.safeParse(input);
  if (!parsed.success) throw new DogfoodError("VALIDATION_FAILED", "Project archive does not match format version 1");
  const archive = parsed.data;
  if (archive.eventId !== eventId) throw new DogfoodError("VALIDATION_FAILED", "Archive eventId must match the route eventId");
  if (archive.projects.reduce((sum, project) => sum + project.revisions.length, 0) > 5_000) {
    throw new DogfoodError("VALIDATION_FAILED", "Archive exceeds the 5,000 revision limit");
  }

  const projectIds = archive.projects.map(({ id }) => id);
  const teamIds = [...new Set(archive.projects.map(({ teamId }) => teamId))];
  const trackIds = [...new Set(archive.projects.flatMap(({ revisions }) => revisions.flatMap(({ trackId }) => trackId ? [trackId] : [])))];
  const assetIds = [...new Set(archive.projects.flatMap(({ revisions }) => revisions.flatMap((revision) => [revision.thumbnailAssetId, ...revision.images.map(({ assetId }) => assetId)].filter((id): id is string => Boolean(id)))))];
  const [teams, tracks, assets, existing] = await Promise.all([
    teamIds.length ? db.select({ id: schema.teams.id }).from(schema.teams).where(and(eq(schema.teams.eventId, eventId), inArray(schema.teams.id, teamIds))) : [],
    trackIds.length ? db.select({ id: schema.eventTracks.id }).from(schema.eventTracks).where(and(eq(schema.eventTracks.eventId, eventId), inArray(schema.eventTracks.id, trackIds))) : [],
    assetIds.length ? db.select({ id: schema.assets.id }).from(schema.assets).where(and(eq(schema.assets.eventId, eventId), inArray(schema.assets.id, assetIds))) : [],
    projectIds.length ? db.select({ id: schema.projects.id }).from(schema.projects).where(inArray(schema.projects.id, projectIds)) : [],
  ]);
  if (teams.length !== teamIds.length || tracks.length !== trackIds.length || assets.length !== assetIds.length) {
    throw new DogfoodError("VALIDATION_FAILED", "Archive references a team, track, or asset outside this event");
  }
  if (existing.length) throw new DogfoodError("CONFLICT", "Archive contains project IDs that already exist");

  const seenProjects = new Set<string>();
  const seenTeams = new Set<string>();
  const seenSlugs = new Set<string>();
  const seenRevisions = new Set<string>();
  for (const project of archive.projects) {
    if (seenProjects.has(project.id) || seenTeams.has(project.teamId) || seenSlugs.has(project.slug)) throw new DogfoodError("VALIDATION_FAILED", "Archive contains duplicate project, team, or slug entries");
    seenProjects.add(project.id); seenTeams.add(project.teamId); seenSlugs.add(project.slug);
    const revisions = [...project.revisions].sort((a, b) => a.revisionNumber - b.revisionNumber);
    if (revisions[0]!.revisionNumber !== 1 || revisions.some((revision, index) => revision.revisionNumber !== index + 1) || revisions.at(-1)!.id !== project.currentRevisionId) {
      throw new DogfoodError("VALIDATION_FAILED", `Project ${project.id} has inconsistent revision history`);
    }
    for (const revision of revisions) {
      if (seenRevisions.has(revision.id)) throw new DogfoodError("VALIDATION_FAILED", "Archive contains duplicate revision IDs");
      seenRevisions.add(revision.id);
      const answers = Object.fromEntries(Object.entries(revision.customAnswers).map(([id, value]) => [id, value]));
      for (const [id, value] of Object.entries(answers)) {
        const question = revision.questionSnapshot.find((candidate) => candidate.id === id);
        if (!question || value.trim().length === 0) throw new DogfoodError("VALIDATION_FAILED", `Project ${project.id} contains an invalid custom answer`);
      }
      if (new Set(revision.questionSnapshot.map((question) => question.id)).size !== revision.questionSnapshot.length || new Set(revision.images.map((image) => image.position)).size !== revision.images.length || new Set(revision.images.map((image) => image.assetId)).size !== revision.images.length) {
        throw new DogfoodError("VALIDATION_FAILED", `Project ${project.id} contains duplicate question or image positions`);
      }
      if (revision.id !== project.currentRevisionId && !revision.title.trim()) throw new DogfoodError("VALIDATION_FAILED", `Project ${project.id} has an empty revision title`);
    }
    const current = revisions.at(-1)!;
    if (project.state !== "DRAFT" && (!current.title.trim() || !current.description.trim())) throw new DogfoodError("VALIDATION_FAILED", `Submitted project ${project.id} is incomplete`);
    if (project.state !== "DRAFT" && !project.submittedAt) throw new DogfoodError("VALIDATION_FAILED", `Submitted project ${project.id} is missing submittedAt`);
    if (project.submittedAt && event.submissionClosesAt && new Date(project.submittedAt) > event.submissionClosesAt) {
      throw new DogfoodError("VALIDATION_FAILED", `Project ${project.id} was submitted after the event deadline`);
    }
    if (project.state !== "DRAFT") {
      const answers = new Set(Object.entries(current.customAnswers)
        .filter(([, value]) => value.trim().length > 0)
        .map(([id]) => id));
      if (event.customQuestions.some((question) => question.required && !answers.has(question.id))) {
        throw new DogfoodError("VALIDATION_FAILED", `Submitted project ${project.id} is missing a required custom answer`);
      }
      if (Object.keys(current.customAnswers).some((id) => !event.customQuestions.some((question) => question.id === id))) {
        throw new DogfoodError("VALIDATION_FAILED", `Submitted project ${project.id} contains an unknown custom answer`);
      }
    }
    if (project.state === "LOCKED" && !project.lockedAt) throw new DogfoodError("VALIDATION_FAILED", `Locked project ${project.id} is missing lockedAt`);
  }

  try {
    await db.transaction(async (tx) => {
      for (const project of archive.projects) {
        await tx.insert(schema.projects).values({
          id: project.id, eventId, teamId: project.teamId, slug: project.slug, state: project.state,
          submittedAt: project.submittedAt ? new Date(project.submittedAt) : null,
          lockedAt: project.lockedAt ? new Date(project.lockedAt) : null,
          createdAt: new Date(project.createdAt), currentRevisionId: null,
        });
        for (const revision of project.revisions) {
          await tx.insert(schema.projectRevisions).values({
            id: revision.id, projectId: project.id, revisionNumber: revision.revisionNumber,
            createdAt: new Date(revision.createdAt), title: revision.title, tagline: revision.tagline,
            description: revision.description, repositoryUrl: revision.repositoryUrl, liveUrl: revision.liveUrl,
            demoVideoUrl: revision.demoVideoUrl, thumbnailAssetId: revision.thumbnailAssetId,
            trackId: revision.trackId, techTags: revision.techTags, customAnswers: revision.customAnswers,
            questionSnapshot: revision.questionSnapshot as CustomQuestion[], createdBy: actor.userId,
          });
          if (revision.images.length) await tx.insert(schema.projectRevisionImages).values(revision.images.map((image) => ({ revisionId: revision.id, ...image })));
        }
        await tx.update(schema.projects).set({ currentRevisionId: project.currentRevisionId }).where(eq(schema.projects.id, project.id));
      }
      await appendAuditEvent(tx, {
        eventId, actorId: actor.userId, action: "projects.bulk_import", resourceType: "project",
        metadata: { count: archive.projects.length, revisionCount: archive.projects.reduce((sum, project) => sum + project.revisions.length, 0) },
      });
    });
  } catch (error) {
    if (sqlState(error) === "23505") throw new DogfoodError("CONFLICT", "Project archive conflicts with existing project or revision data");
    throw error;
  }
  return { imported: archive.projects.length };
}
