import { randomUUID } from "node:crypto";

import { and, db, desc, eq, inArray, schema, sqlState, type EventState, type CustomQuestion } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import { actorDisplayName, notifyEventMembersByRole } from "@dogfood/notifications";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

import {
  assertProjectUnlocked,
  assertSubmissionWindow,
  validateCustomAnswers,
  validateSubmissionCompleteness,
} from "./domain";
import {
  eventMembershipRoles,
  getEventById,
  getProjectById,
  getRevisionById,
  getTeamById,
  getTeamMember,
  type ProjectRow,
  type ProjectRevisionRow,
} from "./repository";

export type CreateProjectInput = {
  teamId: string;
  slug?: string;
  title: string;
  tagline?: string | null;
  description: string;
  repositoryUrl?: string | null;
  liveUrl?: string | null;
  demoVideoUrl?: string | null;
  techTags?: string[];
  trackId?: string | null;
  thumbnailAssetId?: string | null;
  imageAssetIds?: string[];
  customAnswers?: Record<string, string>;
};

export type RevisionInput = {
  expectedCurrentRevisionId: string;
  title: string;
  tagline?: string | null;
  description: string;
  repositoryUrl?: string | null;
  liveUrl?: string | null;
  demoVideoUrl?: string | null;
  techTags?: string[];
  trackId?: string | null;
  thumbnailAssetId?: string | null;
  imageAssetIds?: string[];
  customAnswers?: Record<string, string>;
};

export type ProjectDetail = {
  id: string;
  eventId: string;
  teamId: string;
  slug: string;
  state: ProjectRow["state"];
  submittedAt: Date | null;
  currentRevision: ProjectRevisionRow;
};

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || randomUUID();
}

function toRevisionContent(
  input: CreateProjectInput | RevisionInput,
  questions: CustomQuestion[],
  previous?: ProjectRevisionRow,
) {
  return {
    title: input.title,
    tagline: input.tagline ?? null,
    description: input.description,
    repositoryUrl: input.repositoryUrl ?? null,
    liveUrl: input.liveUrl ?? null,
    demoVideoUrl: input.demoVideoUrl ?? null,
    techTags: input.techTags ?? [],
    trackId: input.trackId === undefined ? (previous?.trackId ?? null) : input.trackId,
    thumbnailAssetId: input.thumbnailAssetId === undefined ? (previous?.thumbnailAssetId ?? null) : input.thumbnailAssetId,
    customAnswers: validateCustomAnswers(questions, input.customAnswers ?? previous?.customAnswers ?? {}, false),
    questionSnapshot: questions,
  };
}

async function validateProjectReferences(
  eventId: string,
  trackId: string | null,
  thumbnailAssetId: string | null,
  imageAssetIds: string[],
): Promise<void> {
  const ids = [...new Set([...imageAssetIds, ...(thumbnailAssetId ? [thumbnailAssetId] : [])])];
  if (imageAssetIds.length > 10 || imageAssetIds.length !== new Set(imageAssetIds).size) {
    throw new DogfoodError("VALIDATION_FAILED", "Choose at most 10 different gallery images");
  }
  if ([...ids, ...(trackId ? [trackId] : [])].some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    throw new DogfoodError("VALIDATION_FAILED", "Invalid track or image ID");
  }
  if (trackId) {
    const tracks = await db.select({ id: schema.eventTracks.id }).from(schema.eventTracks)
      .where(and(eq(schema.eventTracks.id, trackId), eq(schema.eventTracks.eventId, eventId))).limit(1);
    if (!tracks[0]) throw new DogfoodError("VALIDATION_FAILED", "Track does not belong to this event");
  }
  if (ids.length) {
    const assets = await db.select({ id: schema.assets.id }).from(schema.assets)
      .where(and(eq(schema.assets.eventId, eventId), inArray(schema.assets.id, ids)));
    if (assets.length !== ids.length) throw new DogfoodError("VALIDATION_FAILED", "Image does not belong to this event");
  }
}

async function currentImageIds(revisionId: string | null): Promise<string[]> {
  if (!revisionId) return [];
  const rows = await db.select({ assetId: schema.projectRevisionImages.assetId })
    .from(schema.projectRevisionImages)
    .where(eq(schema.projectRevisionImages.revisionId, revisionId))
    .orderBy(schema.projectRevisionImages.position);
  return rows.map((row) => row.assetId);
}

async function requireParticipantProjectAccess(
  actor: Actor,
  eventId: string,
  project: { eventId: string; teamId: string },
  eventState: EventState,
): Promise<void> {
  if (project.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Project not found");
  }
  const membership = await getTeamMember(project.teamId, actor.userId);
  if (!membership) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Actor is not a member of the project team",
    );
  }
  const roles = await eventMembershipRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.PROJECT_MANAGE, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState,
    ownsProject: true,
  });
}

async function toProjectDetail(project: ProjectRow): Promise<ProjectDetail> {
  const revision = await getRevisionById(project.currentRevisionId);
  if (!revision) {
    throw new DogfoodError("NOT_FOUND", "Project is missing its current revision");
  }
  return {
    id: project.id,
    eventId: project.eventId,
    teamId: project.teamId,
    slug: project.slug,
    state: project.state,
    submittedAt: project.submittedAt,
    currentRevision: revision,
  };
}

export async function createProject(
  actor: Actor,
  eventId: string,
  input: CreateProjectInput,
): Promise<ProjectDetail> {
  const event = await getEventById(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const team = await getTeamById(input.teamId);
  if (!team || team.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Team not found");
  }

  const membership = await getTeamMember(team.id, actor.userId);
  if (!membership) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Actor is not a member of the team",
    );
  }
  const roles = await eventMembershipRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.PROJECT_MANAGE, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state,
    ownsProject: true,
  });

  assertSubmissionWindow(new Date(), event);

  const content = toRevisionContent(input, event.customQuestions);
  const imageAssetIds = input.imageAssetIds ?? [];
  await validateProjectReferences(eventId, content.trackId, content.thumbnailAssetId, imageAssetIds);

  try {
    const projectId = await db.transaction(async (tx) => {
      const [project] = await tx
        .insert(schema.projects)
        .values({
          eventId,
          teamId: team.id,
          slug: input.slug ?? slugify(input.title),
        })
        .returning();

      const [revision] = await tx
        .insert(schema.projectRevisions)
        .values({
          projectId: project.id,
          revisionNumber: 1,
          ...content,
          createdBy: actor.userId,
        })
        .returning();

      if (imageAssetIds.length) {
        await tx.insert(schema.projectRevisionImages).values(
          imageAssetIds.map((assetId, position) => ({ revisionId: revision.id, assetId, position })),
        );
      }

      await tx
        .update(schema.projects)
        .set({ currentRevisionId: revision.id })
        .where(eq(schema.projects.id, project.id));

      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "project.create",
        resourceType: "project",
        resourceId: project.id,
        metadata: { teamId: team.id, revisionId: revision.id },
      });

      return project.id;
    });

    const project = await getProjectById(projectId);
    if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");
    return toProjectDetail(project);
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError(
        "CONFLICT",
        "This team already has a project in the event",
      );
    }
    throw error;
  }
}

export async function reviseProject(
  actor: Actor,
  eventId: string,
  projectId: string,
  input: RevisionInput,
): Promise<ProjectDetail> {
  const project = await getProjectById(projectId);
  if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");

  const event = await getEventById(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireParticipantProjectAccess(
    actor,
    eventId,
    { eventId: project.eventId, teamId: project.teamId },
    event.state,
  );

  if (project.currentRevisionId !== input.expectedCurrentRevisionId) {
    throw new DogfoodError("CONFLICT", "This project changed since you opened it. Reload and try again.");
  }

  assertProjectUnlocked(project);
  assertSubmissionWindow(new Date(), event);

  const previous = await getRevisionById(project.currentRevisionId);
  if (!previous) throw new DogfoodError("NOT_FOUND", "Project is missing its current revision");
  const content = toRevisionContent(input, event.customQuestions, previous);
  const imageAssetIds = input.imageAssetIds ?? await currentImageIds(previous.id);
  await validateProjectReferences(eventId, content.trackId, content.thumbnailAssetId, imageAssetIds);

  try {
    await db.transaction(async (tx) => {
      const latest = await tx
        .select({ revisionNumber: schema.projectRevisions.revisionNumber })
        .from(schema.projectRevisions)
        .where(eq(schema.projectRevisions.projectId, projectId))
        .orderBy(desc(schema.projectRevisions.revisionNumber))
        .limit(1);
      const next = (latest[0]?.revisionNumber ?? 0) + 1;

      const [revision] = await tx
        .insert(schema.projectRevisions)
        .values({
          projectId,
          revisionNumber: next,
          ...content,
          createdBy: actor.userId,
        })
        .returning();

      if (imageAssetIds.length) {
        await tx.insert(schema.projectRevisionImages).values(
          imageAssetIds.map((assetId, position) => ({ revisionId: revision.id, assetId, position })),
        );
      }

      const updatedProjects = await tx
        .update(schema.projects)
        .set({ currentRevisionId: revision.id })
        .where(and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.currentRevisionId, input.expectedCurrentRevisionId),
        ))
        .returning({ id: schema.projects.id });
      if (!updatedProjects[0]) {
        throw new DogfoodError("CONFLICT", "This project changed since you opened it. Reload and try again.");
      }
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "project.revise",
        resourceType: "project",
        resourceId: projectId,
        metadata: { revisionNumber: next, revisionId: revision.id },
      });
    });
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError("CONFLICT", "This project changed since you opened it. Reload and try again.");
    }
    throw error;
  }

  const updated = await getProjectById(projectId);
  if (!updated) throw new DogfoodError("NOT_FOUND", "Project not found");
  return toProjectDetail(updated);
}

export async function submitProject(
  actor: Actor,
  eventId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await getProjectById(projectId);
  if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");

  const event = await getEventById(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireParticipantProjectAccess(
    actor,
    eventId,
    { eventId: project.eventId, teamId: project.teamId },
    event.state,
  );

  assertProjectUnlocked(project);
  assertSubmissionWindow(new Date(), event);

  const revision = await getRevisionById(project.currentRevisionId);
  if (!revision || !validateSubmissionCompleteness(revision)) {
    throw new DogfoodError(
      "SUBMISSION_INCOMPLETE",
      "Project is missing required fields before submission",
    );
  }

  const currentQuestionIds = new Set(event.customQuestions.map((question) => question.id));
  const currentAnswers = Object.fromEntries(
    Object.entries(revision.customAnswers).filter(([id]) => currentQuestionIds.has(id)),
  );
  validateCustomAnswers(event.customQuestions, currentAnswers, true);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({ state: "SUBMITTED", submittedAt: new Date() })
      .where(eq(schema.projects.id, project.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "project.submit",
      resourceType: "project",
      resourceId: project.id,
    });
    await notifyEventMembersByRole(
      tx,
      eventId,
      ["JUDGE", "ORGANIZER"],
      {
        type: "project_submitted",
        title: `A project was submitted for ${event.name}`,
        body: `${await actorDisplayName(tx, actor.userId)} submitted "${revision.title}" for judging.`,
        href: `/events/${eventId}/judge`,
      },
      { excludeUserIds: [actor.userId] },
    );
  });
  const updated = await getProjectById(project.id);
  if (!updated) throw new DogfoodError("NOT_FOUND", "Project not found");
  return toProjectDetail(updated);
}

async function requireEventConfigurePermission(
  actor: Actor,
  eventId: string,
  eventState: EventState,
): Promise<void> {
  const roles = await eventMembershipRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState,
  });
}

export async function lockProject(
  actor: Actor,
  eventId: string,
  projectId: string,
): Promise<void> {
  const event = await getEventById(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventConfigurePermission(actor, eventId, event.state);

  const project = await getProjectById(projectId);
  if (!project || project.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Project not found");
  }
  if (project.state === "LOCKED") return;

  await db.transaction(async (tx) => {
    await tx
      .update(schema.projects)
      .set({ state: "LOCKED", lockedAt: new Date() })
      .where(eq(schema.projects.id, project.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "project.lock",
      resourceType: "project",
      resourceId: project.id,
      metadata: { previousState: project.state },
    });
  });
}

export async function lockAllProjects(
  actor: Actor,
  eventId: string,
): Promise<number> {
  const event = await getEventById(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventConfigurePermission(actor, eventId, event.state);

  const rows = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.eventId, eventId));

  const locked: string[] = [];
  for (const row of rows) {
    const project = await getProjectById(row.id);
    if (project && project.state !== "LOCKED") {
      await lockProject(actor, eventId, project.id);
      locked.push(project.id);
    }
  }
  if (locked.length > 0) {
    await db.transaction(async (tx) => {
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "project.lock_all",
        resourceType: "project",
        metadata: { projectIds: locked },
      });
    });
  }
  return locked.length;
}

export async function withdrawProject(
  actor: Actor,
  eventId: string,
  projectId: string,
): Promise<ProjectDetail> {
  const project = await getProjectById(projectId);
  if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");

  const event = await getEventById(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireParticipantProjectAccess(
    actor,
    eventId,
    { eventId: project.eventId, teamId: project.teamId },
    event.state,
  );

  assertProjectUnlocked(project);

  assertSubmissionWindow(new Date(), event);

  await db.transaction(async (tx) => {
    await tx.update(schema.projects)
      .set({ state: "DRAFT", submittedAt: null })
      .where(eq(schema.projects.id, project.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "project.withdraw",
      resourceType: "project",
      resourceId: project.id,
    });
  });
  const updated = await getProjectById(project.id);
  if (!updated) throw new DogfoodError("NOT_FOUND", "Project not found");
  return toProjectDetail(updated);
}

export { assertSubmissionWindow, assertProjectUnlocked, validateSubmissionCompleteness, validateCustomAnswers } from "./domain";
