import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { and, db, eq, schema } from "@dogfood/db";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import {
  activateRubric,
  addCriterion,
  assignJudge,
  createRubric,
  getEvaluation,
  lockEvaluation,
  reopenEvaluation,
  saveEvaluationDraft,
  startEvaluation,
  submitEvaluation,
} from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let eventCounter = 0;

async function scenario() {
  eventCounter += 1;
  const slug = `eval-event-${eventCounter}`;
  const tag = `${eventCounter}`;

  const organizer = await registerUser({
    email: `org@eval${tag}.test`,
    password: "pass",
    displayName: "Org",
  });
  const participant = await registerUser({
    email: `participant@eval${tag}.test`,
    password: "pass",
    displayName: "Participant",
  });
  const judgeA = await registerUser({
    email: `judge-a@eval${tag}.test`,
    password: "pass",
    displayName: "Judge A",
  });
  const judgeB = await registerUser({
    email: `judge-b@eval${tag}.test`,
    password: "pass",
    displayName: "Judge B",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug,
    name: `Evaluation Event ${eventCounter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participant.id,
    "PARTICIPANT",
  );
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    judgeA.id,
    "JUDGE",
  );
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    judgeB.id,
    "JUDGE",
  );

  // Rosters lock when submissions open, so the team forms during registration.
  const team = await createTeam(actorFor(participant.id), event.id, {
    name: "Team Main",
  });

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const project = await createProject(actorFor(participant.id), event.id, {
    teamId: team.id,
    title: "Project Main",
    description: "main project",
  });
  await submitProject(actorFor(participant.id), event.id, project.id);

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(actorFor(organizer.id), event.id, "JUDGING");

  const rubric = await createRubric(actorFor(organizer.id), event.id, {
    name: "Main Rubric",
  });
  await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Novelty",
    weight: 40,
    minScore: 0,
    maxScore: 10,
  });
  await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Execution",
    weight: 60,
    minScore: 0,
    maxScore: 10,
  });
  await activateRubric(actorFor(organizer.id), event.id, rubric.id);

  const assignmentA = await assignJudge(actorFor(organizer.id), event.id, {
    judgeId: judgeA.id,
    projectId: project.id,
  });
  const assignmentB = await assignJudge(actorFor(organizer.id), event.id, {
    judgeId: judgeB.id,
    projectId: project.id,
  });

  return {
    event,
    organizer: actorFor(organizer.id),
    participant: actorFor(participant.id),
    judgeA: actorFor(judgeA.id),
    judgeB: actorFor(judgeB.id),
    rubricId: rubric.id,
    assignmentAId: assignmentA.id,
    assignmentBId: assignmentB.id,
  };
}

const fullScores = [
  { criterionId: "novelty", score: 8, comment: "fresh" },
  { criterionId: "execution", score: 4 },
].map(() => undefined as never);

function scoresFor(criteria: Array<{ criterionId: string }>): Array<{
  criterionId: string;
  score: number;
  comment?: string | null;
}> {
  return criteria.map((criterion, index) => ({
    criterionId: criterion.criterionId,
    score: index === 0 ? 8 : 4,
    comment: index === 0 ? "fresh" : null,
  }));
}

describe("evaluation workflow", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("starts an evaluation and moves the assignment to IN_PROGRESS", async () => {
    const { event, judgeA, assignmentAId } = await scenario();

    const started = await startEvaluation(judgeA, event.id, assignmentAId);
    expect(started.assignmentId).toBe(assignmentAId);
    expect(started.state).toBe("IN_PROGRESS");
    expect(started.status).toBe("IN_PROGRESS");
    expect(started.currentRevision).toBe(0);
    expect(started.criteria).toHaveLength(2);
    expect(started.criteria.every((c) => c.score === null)).toBe(true);

    const again = await startEvaluation(judgeA, event.id, assignmentAId);
    expect(again.state).toBe("IN_PROGRESS");
  });

  it("saves a partial draft before submission", async () => {
    const { event, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;

    const draft = await saveEvaluationDraft(
      judgeA,
      event.id,
      assignmentAId,
      {
        scores: [scoresFor(criteria)[0]],
        overallComment: "still working",
      },
    );
    expect(draft.overallComment).toBe("still working");
    expect(draft.criteria.find((c) => c.criterionId === criteria[0].criterionId)?.score).toBe(8);
    expect(draft.criteria.find((c) => c.criterionId === criteria[1].criterionId)?.score).toBeNull();

    const read = await getEvaluation(judgeA, event.id, assignmentAId);
    expect(read.criteria[0].score).toBe(8);
    expect(read.state).toBe("IN_PROGRESS");
  });

  it("rejects submission with out-of-range or incomplete scores", async () => {
    const { event, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;
    const c1 = criteria[0].criterionId;
    const c2 = criteria[1].criterionId;

    await expect(
      submitEvaluation(judgeA, event.id, assignmentAId, {
        scores: [
          { criterionId: c1, score: 11 },
          { criterionId: c2, score: 4 },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_SCORE" });

    await expect(
      submitEvaluation(judgeA, event.id, assignmentAId, {
        scores: [{ criterionId: c1, score: 5 }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("submits atomically with a revision snapshot and audit event", async () => {
    const { event, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;

    const submitted = await submitEvaluation(
      judgeA,
      event.id,
      assignmentAId,
      {
        scores: scoresFor(criteria),
        overallComment: "strong entry",
      },
    );
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.status).toBe("SUBMITTED");
    expect(submitted.currentRevision).toBe(1);
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(submitted.overallComment).toBe("strong entry");

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "evaluation.submit"),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0].actorId).toBe(judgeA.userId);

    const revisions = await db
      .select()
      .from(schema.evaluationRevisions)
      .where(eq(schema.evaluationRevisions.changedBy, judgeA.userId));
    expect(revisions).toHaveLength(1);
    expect(revisions[0].revisionNumber).toBe(1);
    expect(revisions[0].scoresJson).toHaveLength(2);
    expect(revisions[0].overallComment).toBe("strong entry");
  });

  it("reopens a submitted evaluation on draft save and writes a second revision on resubmit", async () => {
    const { event, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;
    await submitEvaluation(judgeA, event.id, assignmentAId, {
      scores: scoresFor(criteria),
    });

    const reopened = await saveEvaluationDraft(
      judgeA,
      event.id,
      assignmentAId,
      { overallComment: "revised after feedback" },
    );
    expect(reopened.state).toBe("IN_PROGRESS");
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.submittedAt).toBeNull();

    const resubmitted = await submitEvaluation(
      judgeA,
      event.id,
      assignmentAId,
      { scores: scoresFor(criteria), overallComment: "revised after feedback" },
    );
    expect(resubmitted.state).toBe("SUBMITTED");
    expect(resubmitted.currentRevision).toBe(2);

    const revisions = await db
      .select()
      .from(schema.evaluationRevisions)
      .where(eq(schema.evaluationRevisions.changedBy, judgeA.userId));
    expect(revisions).toHaveLength(2);
    expect(revisions.map((r) => r.revisionNumber).sort()).toEqual([1, 2]);
  });

  it("locks an evaluation and rejects any further edits", async () => {
    const { event, organizer, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;
    await submitEvaluation(judgeA, event.id, assignmentAId, {
      scores: scoresFor(criteria),
    });

    const locked = await lockEvaluation(organizer, event.id, assignmentAId);
    expect(locked.state).toBe("LOCKED");
    expect(locked.status).toBe("LOCKED");
    expect(locked.lockedAt).toBeInstanceOf(Date);

    await expect(
      saveEvaluationDraft(judgeA, event.id, assignmentAId, {
        overallComment: "nope",
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_LOCKED" });
    await expect(
      submitEvaluation(judgeA, event.id, assignmentAId, {
        scores: scoresFor(criteria),
      }),
    ).rejects.toMatchObject({ code: "EVALUATION_LOCKED" });
    await expect(
      startEvaluation(judgeA, event.id, assignmentAId),
    ).rejects.toMatchObject({ code: "EVALUATION_LOCKED" });

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "evaluation.lock"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("reopens a submitted evaluation without discarding its scores", async () => {
    const { event, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await getEvaluation(judgeA, event.id, assignmentAId))
      .criteria;
    await submitEvaluation(judgeA, event.id, assignmentAId, {
      scores: scoresFor(criteria),
      overallComment: "final thoughts",
    });

    const reopened = await reopenEvaluation(judgeA, event.id, assignmentAId);
    expect(reopened.state).toBe("IN_PROGRESS");
    expect(reopened.status).toBe("IN_PROGRESS");
    expect(reopened.submittedAt).toBeNull();
    // The judge's existing scores and comment survive the reopen.
    expect(reopened.overallComment).toBe("final thoughts");
    expect(
      reopened.criteria.every((c) => c.score !== null),
    ).toBe(true);
  });

  it("freezes evaluations once results are ready", async () => {
    const { event, organizer, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await getEvaluation(judgeA, event.id, assignmentAId))
      .criteria;
    await submitEvaluation(judgeA, event.id, assignmentAId, {
      scores: scoresFor(criteria),
    });

    // Judging stays open while the event is in JUDGING.
    const reopened = await saveEvaluationDraft(judgeA, event.id, assignmentAId, {
      overallComment: "still open",
    });
    expect(reopened.state).toBe("IN_PROGRESS");

    await transitionEvent(organizer, event.id, "RESULTS_READY");

    await expect(
      startEvaluation(judgeA, event.id, assignmentAId),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      saveEvaluationDraft(judgeA, event.id, assignmentAId, {
        overallComment: "too late",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      submitEvaluation(judgeA, event.id, assignmentAId, {
        scores: scoresFor(criteria),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // The frozen evaluation keeps the last draft.
    const current = await getEvaluation(judgeA, event.id, assignmentAId);
    expect(current.state).toBe("IN_PROGRESS");
    expect(current.overallComment).toBe("still open");
  });

  it("lets only the organizer lock and only after the judge submitted", async () => {
    const { event, organizer, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;

    await expect(
      lockEvaluation(judgeA, event.id, assignmentAId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      lockEvaluation(organizer, event.id, assignmentAId),
    ).rejects.toMatchObject({ code: "EVALUATION_LOCKED" });

    await submitEvaluation(judgeA, event.id, assignmentAId, {
      scores: scoresFor(criteria),
    });
    await expect(
      lockEvaluation(organizer, event.id, assignmentAId),
    ).resolves.toMatchObject({ state: "LOCKED" });
  });

  it("keeps evaluations isolated between judges", async () => {
    const { event, judgeA, judgeB, assignmentAId, assignmentBId } =
      await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;

    await expect(
      getEvaluation(judgeB, event.id, assignmentAId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      saveEvaluationDraft(judgeB, event.id, assignmentAId, {
        scores: scoresFor(criteria),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      submitEvaluation(judgeB, event.id, assignmentAId, {
        scores: scoresFor(criteria),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      getEvaluation(judgeA, event.id, assignmentBId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets organizers read raw evaluation data before and after lock", async () => {
    const { event, organizer, judgeA, assignmentAId } = await scenario();

    await startEvaluation(judgeA, event.id, assignmentAId);
    const criteria = (await startEvaluation(
      judgeA,
      event.id,
      assignmentAId,
    )).criteria;
    await submitEvaluation(judgeA, event.id, assignmentAId, {
      scores: scoresFor(criteria),
    });

    const submitted = await getEvaluation(organizer, event.id, assignmentAId);
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.criteria.some((c) => c.score !== null)).toBe(true);

    await lockEvaluation(organizer, event.id, assignmentAId);
    const visible = await getEvaluation(organizer, event.id, assignmentAId);
    expect(visible.state).toBe("LOCKED");
    expect(visible.criteria.some((c) => c.score !== null)).toBe(true);
  });

  it("enforces event scoping on evaluation access", async () => {
    const { organizer, judgeA, assignmentAId } = await scenario();
    const foreign = await createEvent(organizer, {
      slug: `foreign-eval-${eventCounter}`,
      name: "Foreign Event",
      timezone: "UTC",
    });

    await expect(
      startEvaluation(judgeA, foreign.id, assignmentAId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});