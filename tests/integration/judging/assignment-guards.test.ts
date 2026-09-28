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
  startEvaluation,
  unassignJudge,
} from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let scenarioCounter = 0;

async function scenario() {
  scenarioCounter += 1;
  const tag = `ac${scenarioCounter}`;

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
  const judgeTeam = await registerUser({
    email: `judge-team@${tag}.test`,
    password: "pass",
    displayName: "Judge Team",
  });
  const judgeClean = await registerUser({
    email: `judge-clean@${tag}.test`,
    password: "pass",
    displayName: "Judge Clean",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug: `assign-guard-${scenarioCounter}`,
    name: `Assignment Guards ${scenarioCounter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  for (const [user, role] of [
    [participant, "PARTICIPANT"],
    [judgeTeam, "JUDGE"],
    [judgeClean, "JUDGE"],
  ] as const) {
    await grantEventMembership(actorFor(organizer.id), event.id, user.id, role);
  }

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
    name: "Rubric",
  });
  await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Innovation",
    weight: 100,
    minScore: 0,
    maxScore: 10,
  });
  await activateRubric(actorFor(organizer.id), event.id, rubric.id);

  return { organizer, participant, judgeTeam, judgeClean, event, project };
}

describe("judge assignment guards", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("refuses to assign a judge to their own team's project", async () => {
    const { organizer, judgeTeam, event, project } = await scenario();

    await db.insert(schema.teamMembers).values({
      eventId: event.id,
      teamId: project.teamId,
      userId: judgeTeam.id,
      isOwner: false,
    });

    await expect(
      assignJudge(actorFor(organizer.id), event.id, {
        judgeId: judgeTeam.id,
        projectId: project.id,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("prevents a judge who joins the team later from starting an evaluation", async () => {
    const { organizer, judgeClean, event, project } = await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeClean.id,
      projectId: project.id,
    });

    await db.insert(schema.teamMembers).values({
      eventId: event.id,
      teamId: project.teamId,
      userId: judgeClean.id,
      isOwner: false,
    });

    await expect(
      startEvaluation(actorFor(judgeClean.id), event.id, assignment.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("lets an organizer unassign a pending assignment", async () => {
    const { organizer, judgeClean, event, project } = await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeClean.id,
      projectId: project.id,
    });
    await unassignJudge(actorFor(organizer.id), event.id, assignment.id);

    const rows = await db
      .select()
      .from(schema.judgeAssignments)
      .where(eq(schema.judgeAssignments.id, assignment.id));
    expect(rows).toHaveLength(0);

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "judge.unassign"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("refuses to unassign an assignment once evaluating has started", async () => {
    const { organizer, judgeClean, event, project } = await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeClean.id,
      projectId: project.id,
    });
    await startEvaluation(actorFor(judgeClean.id), event.id, assignment.id);

    await expect(
      unassignJudge(actorFor(organizer.id), event.id, assignment.id),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("refuses unassign to non-organizers", async () => {
    const { organizer, judgeClean, participant, event, project } =
      await scenario();

    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judgeClean.id,
      projectId: project.id,
    });

    await expect(
      unassignJudge(actorFor(participant.id), event.id, assignment.id),
    ).rejects.toBeInstanceOf(DogfoodError);
  });
});