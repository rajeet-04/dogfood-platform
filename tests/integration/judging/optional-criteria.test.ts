import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
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

let counter = 0;

async function scenario() {
  counter += 1;
  const tag = `opt${counter}`;

  const organizer = await registerUser({
    email: `org@${tag}.test`,
    password: "pass",
    displayName: "Org",
  });
  const participant = await registerUser({
    email: `part@${tag}.test`,
    password: "pass",
    displayName: "Part",
  });
  const judgeA = await registerUser({
    email: `judge-a@${tag}.test`,
    password: "pass",
    displayName: "Judge A",
  });
  const judgeB = await registerUser({
    email: `judge-b@${tag}.test`,
    password: "pass",
    displayName: "Judge B",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug: `optional-${counter}`,
    name: `Optional Rubric ${counter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  for (const [user, role] of [
    [participant, "PARTICIPANT"],
    [judgeA, "JUDGE"],
    [judgeB, "JUDGE"],
  ] as const) {
    await grantEventMembership(actorFor(organizer.id), event.id, user.id, role);
  }

  // Rosters lock when submissions open, so the team forms during registration.
  const team = await createTeam(actorFor(participant.id), event.id, {
    name: "Team Opt",
  });

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const project = await createProject(actorFor(participant.id), event.id, {
    teamId: team.id,
    title: "Project Opt",
    description: "optional criteria project",
  });
  await submitProject(actorFor(participant.id), event.id, project.id);

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(actorFor(organizer.id), event.id, "JUDGING");

  const rubric = await createRubric(actorFor(organizer.id), event.id, {
    name: "Opt Rubric",
  });
  const required = await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Innovation",
    weight: 60,
    minScore: 0,
    maxScore: 10,
  });
  const optional = await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Polish",
    weight: 40,
    minScore: 0,
    maxScore: 10,
    optional: true,
  });
  await activateRubric(actorFor(organizer.id), event.id, rubric.id);

  return { organizer, participant, judgeA, judgeB, event, project, required, optional };
}

describe("optional rubric criteria", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores optional flag on a criterion", async () => {
    const { optional, required } = await scenario();

    const single = await db
      .select({ rubricId: schema.rubricCriteria.rubricId })
      .from(schema.rubricCriteria)
      .where(eq(schema.rubricCriteria.id, optional.id))
      .limit(1);
    const rows = await db
      .select()
      .from(schema.rubricCriteria)
      .where(eq(schema.rubricCriteria.rubricId, single[0].rubricId));

    expect(rows.find((c) => c.id === required.id)?.isOptional).toBe(false);
    expect(rows.find((c) => c.id === optional.id)?.isOptional).toBe(true);
  });

  it("accepts a submission that omits the optional criterion", async () => {
    const { organizer, judgeA, event, project, required } = await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeA.id,
      projectId: project.id,
    });
    const draft = await startEvaluation(
      actorFor(judgeA.id),
      event.id,
      assignment.id,
    );
    expect(draft.criteria.find((c) => c.criterionId === required.id)?.optional).toBe(false);
    expect(draft.criteria.find((c) => !(c.criterionId === required.id))?.optional).toBe(true);

    await saveEvaluationDraft(actorFor(judgeA.id), event.id, assignment.id, {
      scores: [{ criterionId: required.id, score: 8, comment: "strong" }],
    });
    const detail = await submitEvaluation(
      actorFor(judgeA.id),
      event.id,
      assignment.id,
      {
        scores: [{ criterionId: required.id, score: 8, comment: "strong" }],
      },
    );
    expect(detail.state).toBe("SUBMITTED");
    expect(detail.criteria.find((c) => c.criterionId === required.id)?.score).toBe(8);
    expect(detail.criteria.find((c) => !(c.criterionId === required.id))?.score).toBeNull();
  });

  it("requires scores for every required criterion", async () => {
    const { organizer, judgeB, event, project, optional } = await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeB.id,
      projectId: project.id,
    });
    await startEvaluation(actorFor(judgeB.id), event.id, assignment.id);

    await expect(
      submitEvaluation(actorFor(judgeB.id), event.id, assignment.id, {
        scores: [{ criterionId: optional.id, score: 5 }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses to submit an evaluation with no scores at all", async () => {
    const { organizer, judgeA, event, project } = await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeA.id,
      projectId: project.id,
    });
    await startEvaluation(actorFor(judgeA.id), event.id, assignment.id);

    await expect(
      submitEvaluation(actorFor(judgeA.id), event.id, assignment.id, {
        scores: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });
});
