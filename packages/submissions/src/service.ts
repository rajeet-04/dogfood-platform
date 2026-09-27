import { randomUUID } from "node:crypto";

import { db, desc, eq, schema, sqlState, type EventState } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { assertSubmissionWindow, validateSubmissionCompleteness } from "./domain";
import {
  eventMembershipRoles,
  getEventById,
  getProjectById,
  getRevisionById,
  getTeamById,
  getTeamMember,
  setProjectSubmissionState,
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
};

export type RevisionInput = {
  title: string;
  tagline?: string | null;
  description: string;
  repositoryUrl?: string | null;
  liveUrl?: string | null;
  demoVideoUrl?: string | null;
  techTags?: string[];
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

function toRevisionContent(input: CreateProjectInput | RevisionInput) {
  return {
    title: input.title,
    tagline: input.tagline ?? null,
    description: input.description,
    repositoryUrl: input.repositoryUrl ?? null,
    liveUrl: input.liveUrl ?? null,
    demoVideoUrl: input.demoVideoUrl ?? null,
    techTags: input.techTags ?? [],
  };
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

  const content = toRevisionContent(input);

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

      await tx
        .update(schema.projects)
        .set({ currentRevisionId: revision.id })
        .where(eq(schema.projects.id, project.id));

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

  assertSubmissionWindow(new Date(), event);

  const content = toRevisionContent(input);

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

    await tx
      .update(schema.projects)
      .set({ currentRevisionId: revision.id })
      .where(eq(schema.projects.id, projectId));
  });

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

  assertSubmissionWindow(new Date(), event);

  const revision = await getRevisionById(project.currentRevisionId);
  if (!revision || !validateSubmissionCompleteness(revision)) {
    throw new DogfoodError(
      "SUBMISSION_INCOMPLETE",
      "Project is missing required fields before submission",
    );
  }

  await setProjectSubmissionState(project.id, "SUBMITTED", new Date());
  const updated = await getProjectById(project.id);
  if (!updated) throw new DogfoodError("NOT_FOUND", "Project not found");
  return toProjectDetail(updated);
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

  if (project.lockedAt) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Submissions are locked and cannot be withdrawn",
    );
  }

  assertSubmissionWindow(new Date(), event);

  await setProjectSubmissionState(project.id, "DRAFT", null);
  const updated = await getProjectById(project.id);
  if (!updated) throw new DogfoodError("NOT_FOUND", "Project not found");
  return toProjectDetail(updated);
}

export { assertSubmissionWindow, validateSubmissionCompleteness } from "./domain";