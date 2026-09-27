import {
  and,
  db,
  eq,
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
  assertRubricActivatable,
  toNumber,
  type CriterionInput,
} from "./domain";

export type CreateRubricInput = {
  name: string;
};

export type AssignJudgeInput = {
  judgeId: string;
  projectId: string;
};

type RubricRow = typeof schema.rubrics.$inferSelect;
type CriterionRow = typeof schema.rubricCriteria.$inferSelect;
type AssignmentRow = typeof schema.judgeAssignments.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;
type RevisionRow = typeof schema.projectRevisions.$inferSelect;

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

async function eventRoles(userId: string, eventId: string): Promise<EventRole[]> {
  const rows = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, userId),
        eq(schema.eventMemberships.eventId, eventId),
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

async function loadProjectById(projectId: string): Promise<ProjectRow | undefined> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  return rows[0];
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

  const [created] = await db
    .insert(schema.rubrics)
    .values({ eventId, name: input.name, version: 1 })
    .returning();
  return created;
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

  const [created] = await db
    .insert(schema.rubricCriteria)
    .values({
      rubricId: rubric.id,
      name: input.name,
      description: input.description ?? null,
      weight: String(input.weight),
      minScore: String(input.minScore),
      maxScore: String(input.maxScore),
      sortOrder,
    })
    .returning();
  return created;
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
    return tx
      .update(schema.rubrics)
      .set({ active: true })
      .where(eq(schema.rubrics.id, rubric.id))
      .returning();
  });
  return activated;
}

export async function assignJudge(
  actor: Actor,
  eventId: string,
  input: AssignJudgeInput,
): Promise<AssignmentRow> {
  const event = await loadEvent(eventId);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_CONFIGURE,
  );

  const project = await loadProjectById(input.projectId);
  if (!project || project.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Project not found");
  }

  const judgeRoles = await eventRoles(input.judgeId, eventId);
  if (!judgeRoles.includes("JUDGE")) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Judge is not a judge of this event",
    );
  }

  try {
    const assignment = await db.transaction(async (tx) => {
      const [assignment] = await tx
        .insert(schema.judgeAssignments)
        .values({
          eventId,
          judgeId: input.judgeId,
          projectId: project.id,
          status: "ASSIGNED",
          assignedBy: actor.userId,
        })
        .returning();
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "judge.assign",
        resourceType: "judge_assignment",
        resourceId: assignment.id,
        metadata: { judgeId: input.judgeId, projectId: project.id },
      });
      return assignment;
    });
    return assignment;
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError(
        "CONFLICT",
        "Judge is already assigned to this project in the event",
      );
    }
    throw error;
  }
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

  return toAssignedProjectDetail(project);
}