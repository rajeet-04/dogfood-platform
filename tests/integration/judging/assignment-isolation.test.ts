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
  getAssignedProject,
  getEvaluation,
  getJudgeQueue,
  getJudgeQueueItem,
  startEvaluation,
} from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

async function eventInJudging() {
  const organizer = await registerUser({
    email: "org@judging.test",
    password: "pass",
    displayName: "Org",
  });
  const participantA = await registerUser({
    email: "participant-a@judging.test",
    password: "pass",
    displayName: "Participant A",
  });
  const participantB = await registerUser({
    email: "participant-b@judging.test",
    password: "pass",
    displayName: "Participant B",
  });
  const judgeA = await registerUser({
    email: "judge-a@judging.test",
    password: "pass",
    displayName: "Judge A",
  });
  const judgeB = await registerUser({
    email: "judge-b@judging.test",
    password: "pass",
    displayName: "Judge B",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug: "judging-event",
    name: "Judging Event",
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participantA.id,
    "PARTICIPANT",
  );
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participantB.id,
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

  // Rosters lock when submissions open, so both teams form during registration.
  const teamA = await createTeam(actorFor(participantA.id), event.id, {
    name: "Team A",
  });
  const teamB = await createTeam(actorFor(participantB.id), event.id, {
    name: "Team B",
  });

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const projectA = await createProject(actorFor(participantA.id), event.id, {
    teamId: teamA.id,
    title: "Project A",
    description: "first project",
  });
  await submitProject(actorFor(participantA.id), event.id, projectA.id);

  const projectB = await createProject(actorFor(participantB.id), event.id, {
    teamId: teamB.id,
    title: "Project B",
    description: "second project",
  });
  await submitProject(actorFor(participantB.id), event.id, projectB.id);

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(actorFor(organizer.id), event.id, "JUDGING");

  return {
    event,
    organizer: actorFor(organizer.id),
    participantA: actorFor(participantA.id),
    participantB: actorFor(participantB.id),
    judgeA: actorFor(judgeA.id),
    judgeB: actorFor(judgeB.id),
    teamAId: teamA.id,
    projectAId: projectA.id,
    projectBId: projectB.id,
  };
}

async function setUpRubric(organizer: Actor, eventId: string): Promise<string> {
  const rubric = await createRubric(organizer, eventId, {
    name: "Main Rubric",
  });
  await addCriterion(organizer, rubric.id, {
    name: "Novelty",
    weight: 40,
    minScore: 0,
    maxScore: 10,
  });
  await addCriterion(organizer, rubric.id, {
    name: "Execution",
    weight: 60,
    minScore: 0,
    maxScore: 10,
  });
  await activateRubric(organizer, eventId, rubric.id);
  return rubric.id;
}

describe("rubrics and judge assignments", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("activates a rubric only when criteria exist and weights sum to the target", async () => {
    const { event, organizer } = await eventInJudging();

    const rubric = await createRubric(organizer, event.id, {
      name: "Main Rubric",
    });
    await expect(
      activateRubric(organizer, event.id, rubric.id),
    ).rejects.toMatchObject({ code: "RUBRIC_INCOMPLETE" });

    await addCriterion(organizer, rubric.id, {
      name: "Novelty",
      weight: 30,
      minScore: 0,
      maxScore: 10,
    });
    await expect(
      activateRubric(organizer, event.id, rubric.id),
    ).rejects.toMatchObject({ code: "RUBRIC_INCOMPLETE" });

    await addCriterion(organizer, rubric.id, {
      name: "Execution",
      weight: 70,
      minScore: 0,
      maxScore: 10,
    });
    const active = await activateRubric(organizer, event.id, rubric.id);
    expect(active.active).toBe(true);
  });

  it("rejects invalid criterion input through the service", async () => {
    const { event, organizer } = await eventInJudging();
    const rubric = await createRubric(organizer, event.id, {
      name: "Main Rubric",
    });

    await expect(
      addCriterion(organizer, rubric.id, {
        name: "Bad",
        weight: -5,
        minScore: 0,
        maxScore: 10,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      addCriterion(organizer, rubric.id, {
        name: "Bad",
        weight: 10,
        minScore: 10,
        maxScore: 10,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("assigns a judge to a project and rejects duplicates", async () => {
    const { event, organizer, judgeA, projectAId } = await eventInJudging();

    const assignment = await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });
    expect(assignment.judgeId).toBe(judgeA.userId);
    expect(assignment.projectId).toBe(projectAId);
    expect(assignment.status).toBe("ASSIGNED");

    await expect(
      assignJudge(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects manual assignments outside a judge's configured track scope", async () => {
    const { event, organizer, judgeA, judgeB, projectAId, projectBId } =
      await eventInJudging();
    const tracks = await db
      .insert(schema.eventTracks)
      .values([
        { eventId: event.id, name: "Track A" },
        { eventId: event.id, name: "Track B" },
      ])
      .returning();
    const [trackA, trackB] = tracks;
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackA.id })
      .where(eq(schema.projectRevisions.projectId, projectAId));
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackB.id })
      .where(eq(schema.projectRevisions.projectId, projectBId));
    await db.insert(schema.judgeTrackScopes).values({
      eventId: event.id,
      judgeId: judgeA.userId,
      trackId: trackA.id,
    });

    await expect(
      assignJudge(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectBId,
      }),
    ).rejects.toMatchObject({ code: "TRACK_SCOPE_VIOLATION" });

    await expect(
      assignJudge(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
      }),
    ).resolves.toMatchObject({ projectId: projectAId });

    // A judge without any scope rows remains event-wide.
    await expect(
      assignJudge(organizer, event.id, {
        judgeId: judgeB.userId,
        projectId: projectBId,
      }),
    ).resolves.toMatchObject({ projectId: projectBId });
  });

  it("denies out-of-scope assigned project and evaluation reads", async () => {
    const { event, organizer, judgeA, projectAId, projectBId } =
      await eventInJudging();
    const tracks = await db
      .insert(schema.eventTracks)
      .values([
        { eventId: event.id, name: "Track A" },
        { eventId: event.id, name: "Track B" },
      ])
      .returning();
    const [trackA, trackB] = tracks;
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackA.id })
      .where(eq(schema.projectRevisions.projectId, projectAId));
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackB.id })
      .where(eq(schema.projectRevisions.projectId, projectBId));

    const assignmentA = await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });
    const assignmentB = await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectBId,
    });
    await setUpRubric(organizer, event.id);
    await startEvaluation(judgeA, event.id, assignmentB.id);
    await db.insert(schema.judgeTrackScopes).values({
      eventId: event.id,
      judgeId: judgeA.userId,
      trackId: trackA.id,
    });

    const queue = await getJudgeQueue(judgeA, event.id);
    expect(queue.map((item) => item.assignmentId)).toEqual([assignmentA.id]);
    await expect(
      getJudgeQueueItem(judgeA, event.id, assignmentB.id),
    ).rejects.toMatchObject({ code: "TRACK_SCOPE_VIOLATION" });
    await expect(
      getAssignedProject(judgeA, event.id, projectBId),
    ).rejects.toMatchObject({ code: "TRACK_SCOPE_VIOLATION" });
    await expect(
      getEvaluation(judgeA, event.id, assignmentB.id),
    ).rejects.toMatchObject({ code: "TRACK_SCOPE_VIOLATION" });
  });

  it("rejects assignment by a non-organizer and to a non-judge", async () => {
    const { event, organizer, participantA, projectAId, projectBId } =
      await eventInJudging();

    await expect(
      assignJudge(actorFor(participantA.userId), event.id, {
        judgeId: participantA.userId,
        projectId: projectAId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      assignJudge(organizer, event.id, {
        judgeId: participantA.userId,
        projectId: projectAId,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    const eventB = await createEvent(organizer, {
      slug: "other-judging-event",
      name: "Other Event",
      timezone: "UTC",
    });
    await expect(
      assignJudge(organizer, eventB.id, {
        judgeId: participantA.userId,
        projectId: projectBId,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("keeps the judge queue limited to the current judge and event", async () => {
    const { event, organizer, judgeA, judgeB, projectAId, projectBId } =
      await eventInJudging();

    await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });
    await assignJudge(organizer, event.id, {
      judgeId: judgeB.userId,
      projectId: projectBId,
    });

    const queueA = await getJudgeQueue(judgeA, event.id);
    expect(queueA).toHaveLength(1);
    expect(queueA[0].project.projectId).toBe(projectAId);
    expect(queueA[0].project.slug).toBeTruthy();

    const queueB = await getJudgeQueue(judgeB, event.id);
    expect(queueB).toHaveLength(1);
    expect(queueB[0].project.projectId).toBe(projectBId);

    await expect(
      getJudgeQueue(actorFor(judgeA.userId), event.id),
    ).resolves.toEqual(queueA);
  });

  it("denies a judge access to a project they are not assigned without revealing it", async () => {
    const { event, organizer, judgeA, judgeB, projectAId, projectBId } =
      await eventInJudging();

    const assignmentA = await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });
    const assignmentB = await assignJudge(organizer, event.id, {
      judgeId: judgeB.userId,
      projectId: projectBId,
    });

    const mine = await getJudgeQueueItem(judgeA, event.id, assignmentA.id);
    expect(mine.assignmentId).toBe(assignmentA.id);
    expect(mine.project.projectId).toBe(projectAId);

    await expect(
      getJudgeQueueItem(judgeA, event.id, assignmentB.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const own = await getAssignedProject(judgeA, event.id, projectAId);
    expect(own.projectId).toBe(projectAId);

    await expect(
      getAssignedProject(judgeA, event.id, projectBId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces event scoping on judge queue reads", async () => {
    const { event, organizer, judgeA, projectAId } = await eventInJudging();

    const assignment = await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });

    const foreignEvent = await createEvent(organizer, {
      slug: "foreign-judging-event",
      name: "Foreign Event",
      timezone: "UTC",
    });

    await expect(
      getAssignedProject(judgeA, foreignEvent.id, projectAId),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      getJudgeQueueItem(judgeA, foreignEvent.id, assignment.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets the organizer read assignment safe fields", async () => {
    const { event, organizer, judgeA, projectAId } = await eventInJudging();

    await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });

    const projected = await getAssignedProject(organizer, event.id, projectAId);
    expect(projected.projectId).toBe(projectAId);
  });

  it("verifies safe fields returned and the draft is the submitted revision", async () => {
    const { event, organizer, judgeA, projectAId } = await eventInJudging();

    await assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    });

    const own = await getAssignedProject(judgeA, event.id, projectAId);
    expect(own.state).toBe("SUBMITTED");
    expect(own.submittedAt).toBeInstanceOf(Date);
    expect(own.currentRevision.title).toBe("Project A");
    expect(own.currentRevision.description).toBe("first project");

    const rows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectAId));
    expect(rows[0]).toBeDefined();
  });
});
