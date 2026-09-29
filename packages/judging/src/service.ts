import {
  and,
  db,
  desc,
  eq,
  inArray,
  schema,
  sqlState,
  type EventRole,
  type EventState,
} from "@dogfood/db";
import { ACTION, requirePermission, type Action } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

import {
  assertCriterionInput,
  assertEvaluationTransition,
  assertRubricActivatable,
  toNumber,
  validateSubmittedScores,
  type CriterionInput,
  type EvaluationState,
} from "./domain";

export type CreateRubricInput = {
  name: string;
};

export type AssignJudgeInput = {
  judgeId: string;
  projectId: string;
};

export type GenerateAssignmentInput = {
  judgeIds: string[];
  trackIds?: string[];
  reviewsPerProject: number;
  strategy: "round_robin" | "balanced_by_track";
};

export type JudgeRecusalInput = {
  judgeId: string;
  projectId: string;
  reason: string;
};

type AssignmentProposal = Array<{ judgeId: string; projectId: string }>;

type RubricRow = typeof schema.rubrics.$inferSelect;
type CriterionRow = typeof schema.rubricCriteria.$inferSelect;
type AssignmentRow = typeof schema.judgeAssignments.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;
type RevisionRow = typeof schema.projectRevisions.$inferSelect;
type EvaluationRow = typeof schema.evaluations.$inferSelect;
type ScoreRow = typeof schema.evaluationScores.$inferSelect;

export type AssignedProjectDetail = {
  projectId: string;
  slug: string;
  state: ProjectRow["state"];
  submittedAt: Date | null;
  currentRevision: {
    title: string;
    tagline: string | null;
    description: string;
    repositoryUrl: string | null;
    liveUrl: string | null;
    demoVideoUrl: string | null;
    techTags: string[];
  };
};

export type JudgeQueueItem = {
  assignmentId: string;
  status: AssignmentRow["status"];
  assignedAt: Date;
  project: AssignedProjectDetail;
};

export type EvaluationScoreInput = {
  criterionId: string;
  score: number;
  comment?: string | null;
};

export type SaveEvaluationDraftInput = {
  scores?: EvaluationScoreInput[];
  overallComment?: string | null;
};

export type SubmitEvaluationInput = SaveEvaluationDraftInput;

type StoredScore = {
  criterionId: string;
  score: string | number;
  comment: string | null;
};

export type EvaluationDetail = {
  assignmentId: string;
  state: EvaluationState;
  status: AssignmentRow["status"];
  rubricId: string;
  currentRevision: number;
  overallComment: string | null;
  startedAt: Date;
  submittedAt: Date | null;
  lockedAt: Date | null;
  criteria: Array<{
    criterionId: string;
    name: string;
    weight: number;
    minScore: number;
    maxScore: number;
    optional: boolean;
    score: number | null;
    comment: string | null;
  }>;
};

async function eventRoles(userId: string, eventId: string): Promise<EventRole[]> {
  const rows = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, userId),
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.isActive, true),
      ),
    );
  return rows.map((row) => row.role);
}

async function requireEventPermission(
  actor: Actor,
  eventId: string,
  eventState: EventState,
  action: Action,
): Promise<void> {
  const roles = await eventRoles(actor.userId, eventId);
  requirePermission(actor, action, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState,
  });
}

async function loadEvent(eventId: string) {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return rows[0];
}

const JUDGING_CLOSED_STATES: EventState[] = [
  "RESULTS_READY",
  "PUBLISHED",
  "ARCHIVED",
];

/**
 * Judges may keep working on an evaluation until results are generated. Once
 * the event reaches RESULTS_READY (or later) every evaluation is frozen.
 */
export function isJudgingClosed(eventState: EventState): boolean {
  return JUDGING_CLOSED_STATES.includes(eventState);
}

async function assertJudgingOpen(eventId: string): Promise<void> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  if (isJudgingClosed(event.state as EventState)) {
    throw new DogfoodError(
      "CONFLICT",
      "Judging for this event is closed because results have already been generated",
    );
  }
}

async function loadProjectById(projectId: string): Promise<ProjectRow | undefined> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  return rows[0];
}

async function isUserOnProjectTeam(userId: string, projectId: string): Promise<boolean> {
  const project = await loadProjectById(projectId);
  if (!project?.teamId) return false;
  const rows = await db
    .select({ teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, project.teamId),
        eq(schema.teamMembers.userId, userId),
      ),
    );
  return rows.length > 0;
}

async function loadRevisionById(
  revisionId: string | null,
): Promise<RevisionRow | undefined> {
  if (!revisionId) return undefined;
  const rows = await db
    .select()
    .from(schema.projectRevisions)
    .where(eq(schema.projectRevisions.id, revisionId))
    .limit(1);
  return rows[0];
}

async function projectIsInJudgeTrackScope(
  judgeId: string,
  eventId: string,
  project: ProjectRow,
): Promise<boolean> {
  const scopes = await db
    .select({ trackId: schema.judgeTrackScopes.trackId })
    .from(schema.judgeTrackScopes)
    .where(
      and(
        eq(schema.judgeTrackScopes.eventId, eventId),
        eq(schema.judgeTrackScopes.judgeId, judgeId),
      ),
    );

  // No scope rows means the judge may review projects across the whole event.
  if (scopes.length === 0) return true;

  const revision = await loadRevisionById(project.currentRevisionId);
  return Boolean(
    revision?.trackId && scopes.some((scope) => scope.trackId === revision.trackId),
  );
}

async function requireProjectWithinJudgeTrackScope(
  judgeId: string,
  eventId: string,
  project: ProjectRow,
): Promise<void> {
  if (!(await projectIsInJudgeTrackScope(judgeId, eventId, project))) {
    throw new DogfoodError(
      "TRACK_SCOPE_VIOLATION",
      "Judge is not scoped to this project's track",
    );
  }
}

async function requireActorTrackScope(
  actor: Actor,
  eventId: string,
  project: ProjectRow,
  roles: EventRole[],
): Promise<void> {
  if (actor.isPlatformAdmin || !roles.includes("JUDGE")) return;
  await requireProjectWithinJudgeTrackScope(actor.userId, eventId, project);
}

async function isAssigned(
  userId: string,
  eventId: string,
  projectId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.judgeAssignments.id })
    .from(schema.judgeAssignments)
    .where(
      and(
        eq(schema.judgeAssignments.eventId, eventId),
        eq(schema.judgeAssignments.judgeId, userId),
        eq(schema.judgeAssignments.projectId, projectId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function toAssignedProjectDetail(
  project: ProjectRow,
): Promise<AssignedProjectDetail> {
  const revision = await loadRevisionById(project.currentRevisionId);
  return {
    projectId: project.id,
    slug: project.slug,
    state: project.state,
    submittedAt: project.submittedAt,
    currentRevision: {
      title: revision?.title ?? "",
      tagline: revision?.tagline ?? null,
      description: revision?.description ?? "",
      repositoryUrl: revision?.repositoryUrl ?? null,
      liveUrl: revision?.liveUrl ?? null,
      demoVideoUrl: revision?.demoVideoUrl ?? null,
      techTags: revision?.techTags ?? [],
    },
  };
}

export async function createRubric(
  actor: Actor,
  eventId: string,
  input: CreateRubricInput,
): Promise<RubricRow> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );

  const existing = await db
    .select({ version: schema.rubrics.version })
    .from(schema.rubrics)
    .where(eq(schema.rubrics.eventId, eventId))
    .orderBy(desc(schema.rubrics.version))
    .limit(1);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.rubrics)
      .values({ eventId, name: input.name, version: (existing[0]?.version ?? 0) + 1 })
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "rubric.create",
      resourceType: "rubric",
      resourceId: created.id,
      metadata: { name: created.name, version: created.version },
    });
    return created;
  });
}

export async function addCriterion(
  actor: Actor,
  rubricId: string,
  input: CriterionInput,
): Promise<CriterionRow> {
  const rows = await db
    .select()
    .from(schema.rubrics)
    .where(eq(schema.rubrics.id, rubricId))
    .limit(1);
  const rubric = rows[0];
  if (!rubric) throw new DogfoodError("NOT_FOUND", "Rubric not found");

  const event = await loadEvent(rubric.eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    rubric.eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );

  assertCriterionInput(input);

  const orderRows = await db
    .select({ sortOrder: schema.rubricCriteria.sortOrder })
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubric.id))
    .orderBy(schema.rubricCriteria.sortOrder);
  const nextSort = orderRows.length
    ? orderRows[orderRows.length - 1].sortOrder + 1
    : 0;
  const sortOrder = input.sortOrder ?? nextSort;

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.rubricCriteria)
      .values({
        rubricId: rubric.id,
        name: input.name,
        description: input.description ?? null,
        weight: String(input.weight),
        minScore: String(input.minScore),
        maxScore: String(input.maxScore),
        isOptional: input.optional ?? false,
        sortOrder,
      })
      .returning();
    await appendAuditEvent(tx, {
      eventId: rubric.eventId,
      actorId: actor.userId,
      action: "rubric.criterion.create",
      resourceType: "rubric_criterion",
      resourceId: created.id,
      metadata: { rubricId: rubric.id, name: created.name, weight: created.weight },
    });
    return created;
  });
}

export async function activateRubric(
  actor: Actor,
  eventId: string,
  rubricId: string,
): Promise<RubricRow> {
  const rows = await db
    .select()
    .from(schema.rubrics)
    .where(eq(schema.rubrics.id, rubricId))
    .limit(1);
  const rubric = rows[0];
  if (!rubric || rubric.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Rubric not found");
  }

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );

  const criteria = await db
    .select()
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubric.id))
    .orderBy(schema.rubricCriteria.sortOrder);
  assertRubricActivatable(criteria.map((c) => toNumber(c.weight)));

  const [activated] = await db.transaction(async (tx) => {
    await tx
      .update(schema.rubrics)
      .set({ active: false })
      .where(eq(schema.rubrics.eventId, eventId));
    const updated = await tx
      .update(schema.rubrics)
      .set({ active: true })
      .where(eq(schema.rubrics.id, rubric.id))
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "rubric.activate",
      resourceType: "rubric",
      resourceId: rubric.id,
      metadata: { version: rubric.version },
    });
    return updated;
  });
  return activated;
}

export async function assignJudge(
  actor: Actor,
  eventId: string,
  input: AssignJudgeInput,
): Promise<AssignmentRow> {
  const [assignment] = await assignJudges(actor, eventId, [input]);
  return assignment;
}

export async function assignJudges(
  actor: Actor,
  eventId: string,
  inputs: AssignJudgeInput[],
): Promise<AssignmentRow[]> {
  if (!inputs.length || new Set(inputs.map(({ judgeId, projectId }) => `${judgeId}:${projectId}`)).size !== inputs.length) {
    throw new DogfoodError("VALIDATION_FAILED", "Assignments must be non-empty and unique");
  }
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );
  await assertJudgingOpen(eventId);
  const projectIds = [...new Set(inputs.map(({ projectId }) => projectId))].sort();
  try {
    return await db.transaction(async (tx) => {
      const [lockedEvent] = await tx
        .select({ state: schema.events.state })
        .from(schema.events)
        .where(eq(schema.events.id, eventId))
        .for("update")
        .limit(1);
      if (!lockedEvent) throw new DogfoodError("NOT_FOUND", "Event not found");
      if (isJudgingClosed(lockedEvent.state as EventState)) {
        throw new DogfoodError("CONFLICT", "Judging for this event is closed because results have already been generated");
      }
      const lockedProjects = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.eventId, eventId), inArray(schema.projects.id, projectIds)))
        .orderBy(schema.projects.id)
        .for("update");
      if (lockedProjects.length !== projectIds.length) {
        throw new DogfoodError("NOT_FOUND", "Project not found");
      }
      const assignments: AssignmentRow[] = [];
      for (const input of inputs) {
        const [project] = await tx
          .select()
          .from(schema.projects)
          .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.eventId, eventId)))
          .limit(1);
        const roles = await tx
          .select({ role: schema.eventMemberships.role })
          .from(schema.eventMemberships)
          .where(
            and(
              eq(schema.eventMemberships.eventId, eventId),
              eq(schema.eventMemberships.userId, input.judgeId),
              eq(schema.eventMemberships.isActive, true),
            ),
          );
        if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");
        if (!roles.some((row) => row.role === "JUDGE")) {
          throw new DogfoodError("VALIDATION_FAILED", "Judge is not an active judge of this event");
        }
        const [revision] = project.currentRevisionId
          ? await tx.select({ trackId: schema.projectRevisions.trackId })
              .from(schema.projectRevisions)
              .where(eq(schema.projectRevisions.id, project.currentRevisionId))
              .limit(1)
          : [];
        const scopes = await tx
          .select({ trackId: schema.judgeTrackScopes.trackId })
          .from(schema.judgeTrackScopes)
          .where(and(
            eq(schema.judgeTrackScopes.eventId, eventId),
            eq(schema.judgeTrackScopes.judgeId, input.judgeId),
          ));
        if (scopes.length && !scopes.some((scope) => scope.trackId === revision?.trackId)) {
          throw new DogfoodError("TRACK_SCOPE_VIOLATION", "Judge is not scoped to this project's track");
        }
        const teamConflicts = await tx
          .select({ userId: schema.teamMembers.userId })
          .from(schema.teamMembers)
          .where(and(
            eq(schema.teamMembers.teamId, project.teamId),
            eq(schema.teamMembers.userId, input.judgeId),
          ))
          .limit(1);
        const recusals = await tx
          .select({ id: schema.judgeRecusals.id })
          .from(schema.judgeRecusals)
          .where(and(
            eq(schema.judgeRecusals.eventId, eventId),
            eq(schema.judgeRecusals.judgeId, input.judgeId),
            eq(schema.judgeRecusals.projectId, input.projectId),
          ))
          .limit(1);
        if (teamConflicts.length) {
          throw new DogfoodError("CONFLICT", "A judge cannot be assigned to a project from their own team");
        }
        if (recusals.length) throw new DogfoodError("CONFLICT", "A recused judge cannot be assigned to this project");
        const [assignment] = await tx
          .insert(schema.judgeAssignments)
          .values({ eventId, judgeId: input.judgeId, projectId: project.id, status: "ASSIGNED", assignedBy: actor.userId })
          .returning();
        await appendAuditEvent(tx, {
          eventId,
          actorId: actor.userId,
          action: "judge.assign",
          resourceType: "judge_assignment",
          resourceId: assignment.id,
          metadata: { judgeId: input.judgeId, projectId: project.id },
        });
        assignments.push(assignment);
      }
      return assignments;
    });
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError(
        "CONFLICT",
        "A judge is already assigned to a project in the event",
      );
    }
    throw error;
  }
}

async function createAssignmentProposal(
  eventId: string,
  input: GenerateAssignmentInput,
): Promise<{
  proposal: AssignmentProposal;
  coverage: {
    projectCount: number;
    requiredReviews: number;
    coveredReviews: number;
    completeProjects: number;
    underCovered: Array<{
      projectId: string;
      title: string;
      assignedReviews: number;
      requiredReviews: number;
    }>;
    judgeLoads: Array<{ judgeId: string; assignments: number }>;
  };
  warnings: string[];
}> {
  if (
    !Number.isInteger(input.reviewsPerProject) ||
    input.reviewsPerProject < 1 ||
    input.judgeIds.length === 0 ||
    new Set(input.judgeIds).size !== input.judgeIds.length
  ) {
    throw new DogfoodError("VALIDATION_FAILED", "Invalid assignment generation input");
  }

  const [event] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await assertJudgingOpen(eventId);

  const judgeRoles = await db
    .select({ userId: schema.eventMemberships.userId, role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.eventId, eventId),
        inArray(schema.eventMemberships.userId, input.judgeIds),
        eq(schema.eventMemberships.isActive, true),
      ),
    );
  const roleByJudge = new Map(judgeRoles.map((row) => [row.userId, row.role]));
  if (input.judgeIds.some((judgeId) => roleByJudge.get(judgeId) !== "JUDGE")) {
    throw new DogfoodError("VALIDATION_FAILED", "Every selected user must be an active event judge");
  }

  const trackIds = [...new Set(input.trackIds ?? [])];
  if (trackIds.length) {
    const tracks = await db
      .select({ id: schema.eventTracks.id })
      .from(schema.eventTracks)
      .where(
        and(
          eq(schema.eventTracks.eventId, eventId),
          inArray(schema.eventTracks.id, trackIds),
        ),
      );
    if (tracks.length !== trackIds.length) {
      throw new DogfoodError("VALIDATION_FAILED", "Every track must belong to this event");
    }
  }

  const joinedProjects = await db
    .select({
      id: schema.projects.id,
      teamId: schema.projects.teamId,
      currentRevisionId: schema.projects.currentRevisionId,
      trackId: schema.projectRevisions.trackId,
      title: schema.projectRevisions.title,
    })
    .from(schema.projects)
    .leftJoin(
      schema.projectRevisions,
      eq(schema.projects.currentRevisionId, schema.projectRevisions.id),
    )
    .where(
      and(
        eq(schema.projects.eventId, eventId),
        eq(schema.projects.state, "SUBMITTED"),
      ),
    );
  const projects = joinedProjects
    .filter((project) => trackIds.length === 0 || (project.trackId && trackIds.includes(project.trackId)))
    .sort((a, b) => a.id.localeCompare(b.id));
  const projectIds = projects.map((project) => project.id);
  const assignmentRows = projectIds.length
    ? await db
        .select({ judgeId: schema.judgeAssignments.judgeId, projectId: schema.judgeAssignments.projectId })
        .from(schema.judgeAssignments)
        .where(
          and(
            eq(schema.judgeAssignments.eventId, eventId),
            inArray(schema.judgeAssignments.projectId, projectIds),
          ),
        )
    : [];
  const allJudgeAssignments = await db
    .select({ judgeId: schema.judgeAssignments.judgeId })
    .from(schema.judgeAssignments)
    .where(
      and(
        eq(schema.judgeAssignments.eventId, eventId),
        inArray(schema.judgeAssignments.judgeId, input.judgeIds),
      ),
    );
  const scopeRows = await db
    .select({ judgeId: schema.judgeTrackScopes.judgeId, trackId: schema.judgeTrackScopes.trackId })
    .from(schema.judgeTrackScopes)
    .where(
      and(
        eq(schema.judgeTrackScopes.eventId, eventId),
        inArray(schema.judgeTrackScopes.judgeId, input.judgeIds),
      ),
    );
  const scopesByJudge = new Map<string, Set<string>>();
  for (const row of scopeRows) {
    const scopes = scopesByJudge.get(row.judgeId) ?? new Set<string>();
    scopes.add(row.trackId);
    scopesByJudge.set(row.judgeId, scopes);
  }
  const teamRows = await db
    .select({ userId: schema.teamMembers.userId, teamId: schema.teamMembers.teamId })
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.eventId, eventId),
        inArray(schema.teamMembers.userId, input.judgeIds),
      ),
    );
  const teamsByJudge = new Map(teamRows.map((row) => [row.userId, row.teamId]));
  const recusalRows = projectIds.length
    ? await db
        .select({ judgeId: schema.judgeRecusals.judgeId, projectId: schema.judgeRecusals.projectId })
        .from(schema.judgeRecusals)
        .where(
          and(
            eq(schema.judgeRecusals.eventId, eventId),
            inArray(schema.judgeRecusals.projectId, projectIds),
          ),
        )
    : [];
  const recusals = new Set(recusalRows.map((row) => `${row.judgeId}:${row.projectId}`));
  const assignedPairs = new Set(assignmentRows.map((row) => `${row.judgeId}:${row.projectId}`));
  const assignedByProject = new Map<string, number>();
  for (const row of assignmentRows) {
    assignedByProject.set(row.projectId, (assignedByProject.get(row.projectId) ?? 0) + 1);
  }

  const proposal: AssignmentProposal = [];
  const judgeLoads = new Map(input.judgeIds.map((judgeId) => [
    judgeId,
    allJudgeAssignments.filter((row) => row.judgeId === judgeId).length,
  ]));
  const trackLoads = new Map<string, Map<string, number>>();
  const warnings: string[] = [];
  if (projects.length === 0) warnings.push("No submitted projects match the selected tracks");
  let roundRobinIndex = 0;

  for (const project of projects) {
    let assigned = assignedByProject.get(project.id) ?? 0;
    while (assigned < input.reviewsPerProject) {
      const eligible = input.judgeIds.filter((judgeId) => {
        const scopes = scopesByJudge.get(judgeId);
        return !assignedPairs.has(`${judgeId}:${project.id}`) &&
          !recusals.has(`${judgeId}:${project.id}`) &&
          teamsByJudge.get(judgeId) !== project.teamId &&
          (!scopes?.size || Boolean(project.trackId && scopes.has(project.trackId)));
      });
      if (!eligible.length) {
        warnings.push(`Project ${project.id} has insufficient eligible judges`);
        break;
      }

      let judgeId: string;
      if (input.strategy === "round_robin") {
        const next = Array.from({ length: input.judgeIds.length }, (_, offset) =>
          input.judgeIds[(roundRobinIndex + offset) % input.judgeIds.length],
        ).find((candidate) => eligible.includes(candidate));
        if (!next) break;
        judgeId = next;
        roundRobinIndex = (input.judgeIds.indexOf(judgeId) + 1) % input.judgeIds.length;
      } else {
        const loads = trackLoads.get(project.trackId ?? "untracked") ?? new Map<string, number>();
        judgeId = [...eligible].sort((a, b) =>
          (loads.get(a) ?? 0) - (loads.get(b) ?? 0) ||
          (judgeLoads.get(a) ?? 0) - (judgeLoads.get(b) ?? 0) ||
          a.localeCompare(b),
        )[0];
      }

      proposal.push({ judgeId, projectId: project.id });
      assignedPairs.add(`${judgeId}:${project.id}`);
      assignedByProject.set(project.id, ++assigned);
      judgeLoads.set(judgeId, (judgeLoads.get(judgeId) ?? 0) + 1);
      const loads = trackLoads.get(project.trackId ?? "untracked") ?? new Map<string, number>();
      loads.set(judgeId, (loads.get(judgeId) ?? 0) + 1);
      trackLoads.set(project.trackId ?? "untracked", loads);
    }
  }

  const underCovered = projects.flatMap((project) => {
    const assignedReviews = assignedByProject.get(project.id) ?? 0;
    return assignedReviews < input.reviewsPerProject
      ? [{ projectId: project.id, title: project.title ?? "", assignedReviews, requiredReviews: input.reviewsPerProject }]
      : [];
  });
  if (underCovered.length && !warnings.length) warnings.push("Some projects do not have enough eligible judges");

  return {
    proposal,
    coverage: {
      projectCount: projects.length,
      requiredReviews: projects.length * input.reviewsPerProject,
      coveredReviews: projects.reduce(
        (sum, project) => sum + Math.min(assignedByProject.get(project.id) ?? 0, input.reviewsPerProject),
        0,
      ),
      completeProjects: projects.length - underCovered.length,
      underCovered,
      judgeLoads: input.judgeIds.map((judgeId) => ({ judgeId, assignments: judgeLoads.get(judgeId) ?? 0 })),
    },
    warnings: [...new Set(warnings)],
  };
}

export async function generateAssignmentProposal(
  actor: Actor,
  eventId: string,
  input: GenerateAssignmentInput,
) {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state as EventState, ACTION.EVENT_CONFIGURE);
  return createAssignmentProposal(eventId, input);
}

export async function commitAssignmentProposal(
  actor: Actor,
  eventId: string,
  input: GenerateAssignmentInput & { expectedProposal?: AssignmentProposal },
) {
  const { expectedProposal, ...generationInput } = input;
  if (!expectedProposal) {
    throw new DogfoodError("VALIDATION_FAILED", "A reviewed proposal is required before committing");
  }
  const result = await generateAssignmentProposal(actor, eventId, generationInput);
  if (JSON.stringify(expectedProposal) !== JSON.stringify(result.proposal)) {
    throw new DogfoodError(
      "CONFLICT",
      "The assignment proposal changed; review a new preview before committing",
    );
  }
  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .for("update")
      .limit(1);
    if (!event || isJudgingClosed(event.state as EventState)) {
      throw new DogfoodError("CONFLICT", "Judging changed before assignments could be committed");
    }
    const trackIds = [...new Set(generationInput.trackIds ?? [])];
    if (trackIds.length) {
      const tracks = await tx
        .select({ id: schema.eventTracks.id })
        .from(schema.eventTracks)
        .where(and(eq(schema.eventTracks.eventId, eventId), inArray(schema.eventTracks.id, trackIds)));
      if (tracks.length !== trackIds.length) {
        throw new DogfoodError("CONFLICT", "Selected tracks changed; generate a new proposal");
      }
    }
    const projectIds = [...new Set(result.proposal.map((item) => item.projectId))].sort();
    const proposedByProject = new Map<string, number>();
    for (const item of result.proposal) {
      proposedByProject.set(item.projectId, (proposedByProject.get(item.projectId) ?? 0) + 1);
    }
    const lockedProjects = projectIds.length
      ? await tx
          .select()
          .from(schema.projects)
          .where(and(eq(schema.projects.eventId, eventId), inArray(schema.projects.id, projectIds)))
          .orderBy(schema.projects.id)
          .for("update")
      : [];
    if (lockedProjects.length !== projectIds.length) {
      throw new DogfoodError("CONFLICT", "A target project changed; generate a new proposal");
    }
    const projectsById = new Map(lockedProjects.map((project) => [project.id, project]));
    const currentAssignments = projectIds.length
      ? await tx
          .select({ judgeId: schema.judgeAssignments.judgeId, projectId: schema.judgeAssignments.projectId })
          .from(schema.judgeAssignments)
          .where(and(eq(schema.judgeAssignments.eventId, eventId), inArray(schema.judgeAssignments.projectId, projectIds)))
      : [];
    const existingCounts = new Map<string, number>();
    const existingPairs = new Set(currentAssignments.map((row) => `${row.judgeId}:${row.projectId}`));
    for (const row of currentAssignments) existingCounts.set(row.projectId, (existingCounts.get(row.projectId) ?? 0) + 1);
    for (const projectId of projectIds) {
      const project = projectsById.get(projectId)!;
      if (project.state !== "SUBMITTED" || (existingCounts.get(projectId) ?? 0) + (proposedByProject.get(projectId) ?? 0) > generationInput.reviewsPerProject) {
        throw new DogfoodError("CONFLICT", "Project review capacity changed; generate a new proposal");
      }
      const [revision] = project.currentRevisionId
        ? await tx
            .select({ trackId: schema.projectRevisions.trackId })
            .from(schema.projectRevisions)
            .where(eq(schema.projectRevisions.id, project.currentRevisionId))
            .limit(1)
        : [];
      if (trackIds.length && (!revision?.trackId || !trackIds.includes(revision.trackId))) {
        throw new DogfoodError("CONFLICT", "A target project's track changed; generate a new proposal");
      }
    }
    for (const item of result.proposal) {
      const roles = await tx
        .select({ role: schema.eventMemberships.role })
        .from(schema.eventMemberships)
        .where(
          and(
            eq(schema.eventMemberships.eventId, eventId),
            eq(schema.eventMemberships.userId, item.judgeId),
            eq(schema.eventMemberships.isActive, true),
          ),
        );
      const project = projectsById.get(item.projectId);
      if (!roles.some((row) => row.role === "JUDGE") || !project) {
        throw new DogfoodError("CONFLICT", "Assignment eligibility changed; generate a new proposal");
      }
      const [revision] = project.currentRevisionId
        ? await tx
            .select({ trackId: schema.projectRevisions.trackId })
            .from(schema.projectRevisions)
            .where(eq(schema.projectRevisions.id, project.currentRevisionId))
            .limit(1)
        : [];
      const scopes = await tx
        .select({ trackId: schema.judgeTrackScopes.trackId })
        .from(schema.judgeTrackScopes)
        .where(
          and(
            eq(schema.judgeTrackScopes.eventId, eventId),
            eq(schema.judgeTrackScopes.judgeId, item.judgeId),
          ),
        );
      if (scopes.length && !scopes.some((scope) => scope.trackId === revision?.trackId)) {
        throw new DogfoodError("CONFLICT", "Judge track scope changed; generate a new proposal");
      }
      const conflicts = await tx
        .select({ userId: schema.teamMembers.userId })
        .from(schema.teamMembers)
        .where(
          and(
            eq(schema.teamMembers.teamId, project.teamId),
            eq(schema.teamMembers.userId, item.judgeId),
          ),
        )
        .limit(1);
      const recusals = await tx
        .select({ id: schema.judgeRecusals.id })
        .from(schema.judgeRecusals)
        .where(
          and(
            eq(schema.judgeRecusals.eventId, eventId),
            eq(schema.judgeRecusals.judgeId, item.judgeId),
            eq(schema.judgeRecusals.projectId, item.projectId),
          ),
        )
        .limit(1);
      if (conflicts.length || recusals.length || existingPairs.has(`${item.judgeId}:${item.projectId}`)) {
        throw new DogfoodError("CONFLICT", "Assignment eligibility changed; generate a new proposal");
      }
      const [assignment] = await tx
        .insert(schema.judgeAssignments)
        .values({ eventId, judgeId: item.judgeId, projectId: item.projectId, status: "ASSIGNED", assignedBy: actor.userId })
        .returning();
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "judge.assign",
        resourceType: "judge_assignment",
        resourceId: assignment.id,
        metadata: { judgeId: item.judgeId, projectId: item.projectId, strategy: input.strategy },
      });
    }
  });
  return result;
}

export async function createJudgeRecusal(
  actor: Actor,
  eventId: string,
  input: JudgeRecusalInput,
) {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const judgeRoles = await eventRoles(input.judgeId, eventId);
  if (!judgeRoles.includes("JUDGE")) {
    throw new DogfoodError("VALIDATION_FAILED", "Judge is not an active judge of this event");
  }
  const selfRecusal = actor.userId === input.judgeId && judgeRoles.includes("JUDGE");
  if (!selfRecusal) await requireEventPermission(actor, eventId, event.state as EventState, ACTION.EVENT_CONFIGURE);
  const project = await loadProjectById(input.projectId);
  if (!project || project.eventId !== eventId) throw new DogfoodError("NOT_FOUND", "Project not found");
  try {
    const recusal = await db.transaction(async (tx) => {
      const [lockedProject] = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(and(eq(schema.projects.id, input.projectId), eq(schema.projects.eventId, eventId)))
        .for("update")
        .limit(1);
      if (!lockedProject) throw new DogfoodError("NOT_FOUND", "Project not found");
      const activeJudges = await tx
        .select({ id: schema.eventMemberships.id })
        .from(schema.eventMemberships)
        .where(and(
          eq(schema.eventMemberships.eventId, eventId),
          eq(schema.eventMemberships.userId, input.judgeId),
          eq(schema.eventMemberships.role, "JUDGE"),
          eq(schema.eventMemberships.isActive, true),
        ))
        .limit(1);
      if (!activeJudges.length) throw new DogfoodError("CONFLICT", "Judge membership is no longer active");
      const assignments = await tx
        .select({ id: schema.judgeAssignments.id })
        .from(schema.judgeAssignments)
        .where(
          and(
            eq(schema.judgeAssignments.eventId, eventId),
            eq(schema.judgeAssignments.judgeId, input.judgeId),
            eq(schema.judgeAssignments.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (assignments.length) {
        throw new DogfoodError("CONFLICT", "Remove the existing assignment before declaring this recusal");
      }
      const [row] = await tx
        .insert(schema.judgeRecusals)
        .values({ ...input, eventId, createdBy: actor.userId })
        .returning();
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "judge.recusal.create",
        resourceType: "judge_recusal",
        resourceId: row.id,
        metadata: { judgeId: input.judgeId, projectId: input.projectId },
      });
      return row;
    });
    return recusal;
  } catch (error) {
    if (sqlState(error) === "23505") throw new DogfoodError("CONFLICT", "Judge recusal already exists");
    throw error;
  }
}

export async function listJudgeRecusals(actor: Actor, eventId: string) {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state as EventState, ACTION.EVENT_CONFIGURE);
  return db
    .select()
    .from(schema.judgeRecusals)
    .where(eq(schema.judgeRecusals.eventId, eventId))
    .orderBy(schema.judgeRecusals.createdAt);
}

export async function deleteJudgeRecusal(actor: Actor, eventId: string, recusalId: string) {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state as EventState, ACTION.EVENT_CONFIGURE);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(schema.judgeRecusals)
      .where(
        and(
          eq(schema.judgeRecusals.id, recusalId),
          eq(schema.judgeRecusals.eventId, eventId),
        ),
      )
      .returning({
        id: schema.judgeRecusals.id,
        judgeId: schema.judgeRecusals.judgeId,
        projectId: schema.judgeRecusals.projectId,
      });
    if (!row) throw new DogfoodError("NOT_FOUND", "Judge recusal not found");
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge.recusal.delete",
      resourceType: "judge_recusal",
      resourceId: row.id,
      metadata: { judgeId: row.judgeId, projectId: row.projectId },
    });
  });
}

export type JudgeAssignmentFilters = {
  judgeId?: string;
  projectId?: string;
  trackId?: string;
  status?: AssignmentRow["status"];
};

export async function getJudgeAssignments(
  actor: Actor,
  eventId: string,
  filters: JudgeAssignmentFilters = {},
) {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state as EventState, ACTION.EVENT_CONFIGURE);
  const conditions = [eq(schema.judgeAssignments.eventId, eventId)];
  if (filters.judgeId) conditions.push(eq(schema.judgeAssignments.judgeId, filters.judgeId));
  if (filters.projectId) conditions.push(eq(schema.judgeAssignments.projectId, filters.projectId));
  if (filters.status) conditions.push(eq(schema.judgeAssignments.status, filters.status));
  if (filters.trackId) conditions.push(eq(schema.projectRevisions.trackId, filters.trackId));
  const rows = await db
    .select({ assignment: schema.judgeAssignments, trackId: schema.projectRevisions.trackId })
    .from(schema.judgeAssignments)
    .leftJoin(schema.projects, eq(schema.judgeAssignments.projectId, schema.projects.id))
    .leftJoin(
      schema.projectRevisions,
      eq(schema.projects.currentRevisionId, schema.projectRevisions.id),
    )
    .where(and(...conditions))
    .orderBy(schema.judgeAssignments.assignedAt);
  return rows.map(({ assignment, trackId }) => ({ ...assignment, trackId }));
}

export async function unassignJudge(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<void> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );

  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }
  if (assignment.status !== "ASSIGNED") {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      `Cannot unassign an assignment in "${assignment.status}" state`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.judgeAssignments)
      .where(eq(schema.judgeAssignments.id, assignment.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge.unassign",
      resourceType: "judge_assignment",
      resourceId: assignment.id,
      metadata: { judgeId: assignment.judgeId, projectId: assignment.projectId },
    });
  });
}

export async function getJudgeQueue(
  actor: Actor,
  eventId: string,
): Promise<JudgeQueueItem[]> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await eventRoles(actor.userId, eventId);
  if (!actor.isPlatformAdmin && !roles.includes("JUDGE")) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Only judges may view the judging queue",
    );
  }

  const assignments = await db
    .select()
    .from(schema.judgeAssignments)
    .where(
      and(
        eq(schema.judgeAssignments.eventId, eventId),
        eq(schema.judgeAssignments.judgeId, actor.userId),
      ),
    )
    .orderBy(schema.judgeAssignments.assignedAt);

  const items: JudgeQueueItem[] = [];
  for (const assignment of assignments) {
    const project = await loadProjectById(assignment.projectId);
    if (!project) continue;
    if (
      !actor.isPlatformAdmin &&
      roles.includes("JUDGE") &&
      !(await projectIsInJudgeTrackScope(actor.userId, eventId, project))
    ) {
      continue;
    }
    items.push({
      assignmentId: assignment.id,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      project: await toAssignedProjectDetail(project),
    });
  }
  return items;
}

export async function getJudgeQueueItem(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<JudgeQueueItem> {
  const rows = await db
    .select()
    .from(schema.judgeAssignments)
    .where(eq(schema.judgeAssignments.id, assignmentId))
    .limit(1);
  const assignment = rows[0];
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await eventRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.PROJECT_READ_ASSIGNED, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state as EventState,
    isAssigned: assignment.judgeId === actor.userId,
  });

  const project = await loadProjectById(assignment.projectId);
  if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");
  await requireActorTrackScope(actor, eventId, project, roles);

  return {
    assignmentId: assignment.id,
    status: assignment.status,
    assignedAt: assignment.assignedAt,
    project: await toAssignedProjectDetail(project),
  };
}

export async function getAssignedProject(
  actor: Actor,
  eventId: string,
  projectId: string,
): Promise<AssignedProjectDetail> {
  const project = await loadProjectById(projectId);
  if (!project || project.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Project not found");
  }

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await eventRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.PROJECT_READ_ASSIGNED, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state as EventState,
    isAssigned: await isAssigned(actor.userId, eventId, project.id),
  });

  await requireActorTrackScope(actor, eventId, project, roles);

  return toAssignedProjectDetail(project);
}

function toEvaluationDetail(
  evaluation: EvaluationRow,
  assignment: AssignmentRow,
  criteria: CriterionRow[],
  scores: ScoreRow[] | StoredScore[],
): EvaluationDetail {
  const scoreByCriterion = new Map(
    scores.map((score) => [score.criterionId, score]),
  );
  return {
    assignmentId: assignment.id,
    state: evaluation.state,
    status: assignment.status,
    rubricId: evaluation.rubricId,
    currentRevision: evaluation.currentRevision,
    overallComment: evaluation.overallComment,
    startedAt: evaluation.startedAt,
    submittedAt: evaluation.submittedAt,
    lockedAt: evaluation.lockedAt,
    criteria: criteria.map((criterion) => {
      const row = scoreByCriterion.get(criterion.id);
      return {
        criterionId: criterion.id,
        name: criterion.name,
        weight: toNumber(criterion.weight),
        minScore: toNumber(criterion.minScore),
        maxScore: toNumber(criterion.maxScore),
        optional: criterion.isOptional,
        score: row ? toNumber(row.score) : null,
        comment: row ? row.comment : null,
      };
    }),
  };
}

async function loadAssignmentById(
  assignmentId: string,
): Promise<AssignmentRow | undefined> {
  const rows = await db
    .select()
    .from(schema.judgeAssignments)
    .where(eq(schema.judgeAssignments.id, assignmentId))
    .limit(1);
  return rows[0];
}

async function loadEvaluationByAssignment(
  assignmentId: string,
): Promise<EvaluationRow | undefined> {
  const rows = await db
    .select()
    .from(schema.evaluations)
    .where(eq(schema.evaluations.assignmentId, assignmentId))
    .limit(1);
  return rows[0];
}

async function loadActiveRubric(eventId: string) {
  const rows = await db
    .select()
    .from(schema.rubrics)
    .where(
      and(
        eq(schema.rubrics.eventId, eventId),
        eq(schema.rubrics.active, true),
      ),
    )
    .limit(1);
  return rows[0];
}

async function loadCriteria(rubricId: string): Promise<CriterionRow[]> {
  return db
    .select()
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubricId))
    .orderBy(schema.rubricCriteria.sortOrder);
}

async function loadScores(
  evaluationId: string,
): Promise<Array<StoredScore & { evaluationId: string }>> {
  return db
    .select()
    .from(schema.evaluationScores)
    .where(eq(schema.evaluationScores.evaluationId, evaluationId));
}

async function requireAssignmentPermission(
  actor: Actor,
  eventId: string,
  assignment: AssignmentRow,
  action: Action,
): Promise<void> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const roles = await eventRoles(actor.userId, eventId);
  requirePermission(actor, action, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state as EventState,
    isAssigned: assignment.judgeId === actor.userId,
  });
  const project = await loadProjectById(assignment.projectId);
  if (!project || project.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Project not found");
  }
  await requireActorTrackScope(actor, eventId, project, roles);
}

export async function startEvaluation(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<EvaluationDetail> {
  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  await requireAssignmentPermission(
    actor,
    eventId,
    assignment,
    ACTION.EVALUATION_SUBMIT,
  );

  await assertJudgingOpen(eventId);

  if (await isUserOnProjectTeam(actor.userId, assignment.projectId)) {
    throw new DogfoodError(
      "CONFLICT",
      "A judge cannot evaluate a project from their own team",
    );
  }

  const rubric = await loadActiveRubric(eventId);
  if (!rubric) {
    throw new DogfoodError("RUBRIC_INCOMPLETE", "No active rubric for event");
  }

  const existing = await loadEvaluationByAssignment(assignmentId);
  if (existing) {
    if (existing.state === "LOCKED") {
      throw new DogfoodError("EVALUATION_LOCKED", "Evaluation is locked");
    }
    const criteria = await loadCriteria(existing.rubricId);
    return toEvaluationDetail(existing, assignment, criteria, []);
  }

  await db.transaction(async (tx) => {
    const [evaluation] = await tx
      .insert(schema.evaluations)
      .values({
        assignmentId,
        rubricId: rubric.id,
        state: "IN_PROGRESS",
        startedAt: new Date(),
      })
      .returning();
    await tx
      .update(schema.judgeAssignments)
      .set({ status: "IN_PROGRESS" })
      .where(eq(schema.judgeAssignments.id, assignment.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "evaluation.start",
      resourceType: "evaluation",
      resourceId: evaluation.id,
      metadata: { assignmentId, rubricId: rubric.id },
    });
  });

  const starter = await loadAssignmentById(assignmentId);
  const evaluation = await loadEvaluationByAssignment(assignmentId);
  if (!starter) throw new DogfoodError("NOT_FOUND", "Assignment not found");
  if (!evaluation) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not found");
  }
  const criteria = await loadCriteria(rubric.id);
  return toEvaluationDetail(evaluation, starter, criteria, []);
}

export async function saveEvaluationDraft(
  actor: Actor,
  eventId: string,
  assignmentId: string,
  input: SaveEvaluationDraftInput = {},
): Promise<EvaluationDetail> {
  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  await requireAssignmentPermission(
    actor,
    eventId,
    assignment,
    ACTION.EVALUATION_SUBMIT,
  );

  const evaluation = await loadEvaluationByAssignment(assignmentId);
  if (!evaluation) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not started");
  }
  if (evaluation.state === "LOCKED") {
    throw new DogfoodError(
      "EVALUATION_LOCKED",
      "Cannot edit a locked evaluation",
    );
  }

  await assertJudgingOpen(eventId);

  const criteria = await loadCriteria(evaluation.rubricId);
  if (input.scores) {
    for (const item of input.scores) {
      const known = criteria.some((c) => c.id === item.criterionId);
      if (!known) {
        throw new DogfoodError(
          "VALIDATION_FAILED",
          "Score for unknown criterion",
        );
      }
    }
  }

  const reopening = evaluation.state === "SUBMITTED";
  const values: Partial<{
    overallComment: string | null;
    state: EvaluationState;
    submittedAt: Date | null;
  }> = {};
  if (input.overallComment !== undefined) {
    values.overallComment = input.overallComment;
  }
  if (reopening) {
    values.state = "IN_PROGRESS";
    values.submittedAt = null;
  }

  await db.transaction(async (tx) => {
    if (input.scores) {
      await tx
        .delete(schema.evaluationScores)
        .where(eq(schema.evaluationScores.evaluationId, evaluation.id));
      await tx.insert(schema.evaluationScores).values(
        input.scores.map((item) => ({
          evaluationId: evaluation.id,
          criterionId: item.criterionId,
          score: String(item.score),
          comment: item.comment ?? null,
        })),
      );
    }
    if (Object.keys(values).length > 0) {
      await tx
        .update(schema.evaluations)
        .set(values)
        .where(eq(schema.evaluations.id, evaluation.id));
    }
    if (reopening) {
      await tx
        .update(schema.judgeAssignments)
        .set({ status: "IN_PROGRESS" })
        .where(eq(schema.judgeAssignments.id, assignment.id));
    }
    // Scores stay out of the payload: webhook receivers learn that a draft
    // changed, not what it says.
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "evaluation.draft_save",
      resourceType: "evaluation",
      resourceId: evaluation.id,
      metadata: { assignmentId, reopened: reopening },
    });
  });

  const fresh = await loadEvaluationByAssignment(assignmentId);
  const freshAssignment = await loadAssignmentById(assignmentId);
  const scores = await loadScores(evaluation.id);
  if (!fresh || !freshAssignment) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not found");
  }
  return toEvaluationDetail(fresh, freshAssignment, criteria, scores);
}

/**
 * Reopens a submitted evaluation without touching the scores the judge already
 * gave, so the judge can revise them before results are generated.
 */
export async function reopenEvaluation(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<EvaluationDetail> {
  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  await requireAssignmentPermission(
    actor,
    eventId,
    assignment,
    ACTION.EVALUATION_SUBMIT,
  );

  const evaluation = await loadEvaluationByAssignment(assignmentId);
  if (!evaluation) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not started");
  }
  if (evaluation.state === "LOCKED") {
    throw new DogfoodError(
      "EVALUATION_LOCKED",
      "Cannot reopen a locked evaluation",
    );
  }

  await assertJudgingOpen(eventId);

  if (evaluation.state !== "SUBMITTED") {
    throw new DogfoodError(
      "CONFLICT",
      "Only a submitted evaluation can be reopened",
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(schema.evaluations)
      .set({ state: "IN_PROGRESS", submittedAt: null })
      .where(eq(schema.evaluations.id, evaluation.id));
    await tx
      .update(schema.judgeAssignments)
      .set({ status: "IN_PROGRESS" })
      .where(eq(schema.judgeAssignments.id, assignment.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "evaluation.reopen",
      resourceType: "evaluation",
      resourceId: evaluation.id,
      metadata: { assignmentId },
    });
  });

  const fresh = await loadEvaluationByAssignment(assignmentId);
  const freshAssignment = await loadAssignmentById(assignmentId);
  const criteria = await loadCriteria(evaluation.rubricId);
  const scores = await loadScores(evaluation.id);
  if (!fresh || !freshAssignment) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not found");
  }
  return toEvaluationDetail(fresh, freshAssignment, criteria, scores);
}

export async function submitEvaluation(
  actor: Actor,
  eventId: string,
  assignmentId: string,
  input: SubmitEvaluationInput = {},
): Promise<EvaluationDetail> {
  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireAssignmentPermission(
    actor,
    eventId,
    assignment,
    ACTION.EVALUATION_SUBMIT,
  );

  const evaluation = await loadEvaluationByAssignment(assignmentId);
  if (!evaluation) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not started");
  }
  if (evaluation.state === "LOCKED") {
    throw new DogfoodError(
      "EVALUATION_LOCKED",
      "Cannot submit a locked evaluation",
    );
  }

  if (isJudgingClosed(event.state as EventState)) {
    throw new DogfoodError(
      "CONFLICT",
      "Judging for this event is closed because results have already been generated",
    );
  }

  const criteria = await loadCriteria(evaluation.rubricId);
  const bounds = criteria.map((c) => ({
    criterionId: c.id,
    minScore: toNumber(c.minScore),
    maxScore: toNumber(c.maxScore),
    optional: c.isOptional,
  }));

  let storedScores: StoredScore[];
  if (input.scores) {
    validateSubmittedScores(bounds, input.scores);
    storedScores = input.scores.map((item) => ({
      criterionId: item.criterionId,
      score: String(item.score),
      comment: item.comment ?? null,
    }));
  } else {
    const current = await loadScores(evaluation.id);
    const mapped = current.map((score) => ({
      criterionId: score.criterionId,
      score: toNumber(score.score),
      comment: score.comment,
    }));
    validateSubmittedScores(bounds, mapped);
    storedScores = mapped;
  }

  if (storedScores.length === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] At least one criterion score is required",
    );
  }

  const finalComment =
    input.overallComment !== undefined
      ? input.overallComment
      : evaluation.overallComment;
  const revisionNumber = evaluation.currentRevision + 1;
  const scoresJson = storedScores.map((score) => ({
    criterionId: score.criterionId,
    score: toNumber(score.score),
    comment: score.comment,
  }));

  await db.transaction(async (tx) => {
    await tx
      .delete(schema.evaluationScores)
      .where(eq(schema.evaluationScores.evaluationId, evaluation.id));
    await tx.insert(schema.evaluationScores).values(
      storedScores.map((score) => ({
        evaluationId: evaluation.id,
        criterionId: score.criterionId,
        score: String(score.score),
        comment: score.comment,
      })),
    );
    await tx.insert(schema.evaluationRevisions).values({
      evaluationId: evaluation.id,
      revisionNumber,
      scoresJson,
      overallComment: finalComment,
      changedBy: actor.userId,
    });
    await tx
      .update(schema.evaluations)
      .set({
        state: "SUBMITTED",
        currentRevision: revisionNumber,
        overallComment: finalComment,
        submittedAt: new Date(),
      })
      .where(eq(schema.evaluations.id, evaluation.id));
    await tx
      .update(schema.judgeAssignments)
      .set({ status: "SUBMITTED" })
      .where(eq(schema.judgeAssignments.id, assignment.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "evaluation.submit",
      resourceType: "evaluation",
      resourceId: evaluation.id,
      metadata: { assignmentId, revisionNumber },
    });
  });

  const fresh = await loadEvaluationByAssignment(assignmentId);
  const freshAssignment = await loadAssignmentById(assignmentId);
  if (!fresh || !freshAssignment) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not found");
  }
  return toEvaluationDetail(fresh, freshAssignment, criteria, storedScores);
}

export async function lockEvaluation(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<EvaluationDetail> {
  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await eventRoles(actor.userId, eventId);
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state as EventState,
  });

  const evaluation = await loadEvaluationByAssignment(assignmentId);
  if (!evaluation) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not started");
  }
  assertEvaluationTransition(evaluation.state, "LOCKED");

  const criteria = await loadCriteria(evaluation.rubricId);

  await db.transaction(async (tx) => {
    await tx
      .update(schema.evaluations)
      .set({ state: "LOCKED", lockedAt: new Date() })
      .where(eq(schema.evaluations.id, evaluation.id));
    await tx
      .update(schema.judgeAssignments)
      .set({ status: "LOCKED" })
      .where(eq(schema.judgeAssignments.id, assignment.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "evaluation.lock",
      resourceType: "evaluation",
      resourceId: evaluation.id,
      metadata: { assignmentId },
    });
  });

  const fresh = await loadEvaluationByAssignment(assignmentId);
  const freshAssignment = await loadAssignmentById(assignmentId);
  const scores = await loadScores(evaluation.id);
  if (!fresh || !freshAssignment) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not found");
  }
  return toEvaluationDetail(fresh, freshAssignment, criteria, scores);
}

/** Locks every submitted evaluation in the event; returns the count. */
export async function lockAllEvaluations(
  actor: Actor,
  eventId: string,
): Promise<{ locked: number }> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );

  const rows = await db
    .select({ assignmentId: schema.evaluations.assignmentId })
    .from(schema.evaluations)
    .innerJoin(
      schema.judgeAssignments,
      eq(schema.judgeAssignments.id, schema.evaluations.assignmentId),
    )
    .where(
      and(
        eq(schema.judgeAssignments.eventId, eventId),
        eq(schema.evaluations.state, "SUBMITTED"),
      ),
    );
  for (const row of rows) {
    await lockEvaluation(actor, eventId, row.assignmentId);
  }
  return { locked: rows.length };
}

export async function getEvaluation(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<EvaluationDetail> {
  const assignment = await loadAssignmentById(assignmentId);
  if (!assignment || assignment.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Assignment not found");
  }

  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const roles = await eventRoles(actor.userId, eventId);
  const isOrganizer = roles.includes("ORGANIZER");
  if (!isOrganizer) {
    requirePermission(actor, ACTION.EVALUATION_READ, {
      eventId,
      resourceEventId: eventId,
      roles,
      eventState: event.state as EventState,
      ownsEvaluation: assignment.judgeId === actor.userId,
    });
  }

  const project = await loadProjectById(assignment.projectId);
  if (!project || project.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Project not found");
  }
  if (!isOrganizer) {
    await requireActorTrackScope(actor, eventId, project, roles);
  }

  const evaluation = await loadEvaluationByAssignment(assignmentId);
  if (!evaluation) {
    throw new DogfoodError("NOT_FOUND", "Evaluation not started");
  }

  requirePermission(actor, ACTION.EVALUATION_READ, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState: event.state as EventState,
    ownsEvaluation: assignment.judgeId === actor.userId,
  });

  const criteria = await loadCriteria(evaluation.rubricId);
  const scores = await loadScores(evaluation.id);
  return toEvaluationDetail(evaluation, assignment, criteria, scores);
}
