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
    await tx
      .update(schema.evaluations)
      .set(values)
      .where(eq(schema.evaluations.id, evaluation.id));
    if (reopening) {
      await tx
        .update(schema.judgeAssignments)
        .set({ status: "IN_PROGRESS" })
        .where(eq(schema.judgeAssignments.id, assignment.id));
    }
  });

  const fresh = await loadEvaluationByAssignment(assignmentId);
  const freshAssignment = await loadAssignmentById(assignmentId);
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

  const criteria = await loadCriteria(evaluation.rubricId);
  const bounds = criteria.map((c) => ({
    criterionId: c.id,
    minScore: toNumber(c.minScore),
    maxScore: toNumber(c.maxScore),
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
      judgingLocked: false,
    });
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
    judgingLocked: evaluation.state === "LOCKED",
  });

  const criteria = await loadCriteria(evaluation.rubricId);
  const scores = await loadScores(evaluation.id);
  return toEvaluationDetail(evaluation, assignment, criteria, scores);
}