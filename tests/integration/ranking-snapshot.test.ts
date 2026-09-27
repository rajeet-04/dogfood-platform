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
  submitEvaluation,
} from "@dogfood/judging";
import {
  generateRankingSnapshot,
  getRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let eventCounter = 0;

async function scenario() {
  eventCounter += 1;
  const slug = `rank-event-${eventCounter}`;
  const tag = `${eventCounter}`;

  const organizer = await registerUser({
    email: `org@rank${tag}.test`,
    password: "pass",
    displayName: "Org",
  });
  const participantA = await registerUser({
    email: `pa@rank${tag}.test`,
    password: "pass",
    displayName: "Participant A",
  });
  const participantB = await registerUser({
    email: `pb@rank${tag}.test`,
    password: "pass",
    displayName: "Participant B",
  });
  const judgeA = await registerUser({
    email: `ja@rank${tag}.test`,
    password: "pass",
    displayName: "Judge A",
  });
  const judgeB = await registerUser({
    email: `jb@rank${tag}.test`,
    password: "pass",
    displayName: "Judge B",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug,
    name: `Ranking Event ${eventCounter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  for (const [userId, role] of [
    [participantA.id, "PARTICIPANT"],
    [participantB.id, "PARTICIPANT"],
    [judgeA.id, "JUDGE"],
    [judgeB.id, "JUDGE"],
  ] as const) {
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      userId,
      role,
    );
  }

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const teamA = await createTeam(actorFor(participantA.id), event.id, {
    name: "Team A",
  });
  const projectA = await createProject(actorFor(participantA.id), event.id, {
    teamId: teamA.id,
    title: "Project A",
    description: "project a",
  });
  await submitProject(actorFor(participantA.id), event.id, projectA.id);

  const teamB = await createTeam(actorFor(participantB.id), event.id, {
    name: "Team B",
  });
  const projectB = await createProject(actorFor(participantB.id), event.id, {
    teamId: teamB.id,
    title: "Project B",
    description: "project b",
  });
  await submitProject(actorFor(participantB.id), event.id, projectB.id);

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(actorFor(organizer.id), event.id, "JUDGING");

  const rubric = await createRubric(actorFor(organizer.id), event.id, {
    name: "Main Rubric",
  });
  await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Novelty",
    weight: 100,
    minScore: 0,
    maxScore: 10,
  });
  await activateRubric(actorFor(organizer.id), event.id, rubric.id);

  const assignments: Record<string, string> = {};
  for (const [judge, project] of [
    [judgeA.id, projectA.id],
    [judgeA.id, projectB.id],
    [judgeB.id, projectA.id],
    [judgeB.id, projectB.id],
  ] as const) {
    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judge,
      projectId: project,
    });
    assignments[`${judge}-${project}`] = assignment.id;
  }

  return {
    event,
    organizer: actorFor(organizer.id),
    participantA: actorFor(participantA.id),
    judgeA: actorFor(judgeA.id),
    judgeB: actorFor(judgeB.id),
    projectAId: projectA.id,
    projectBId: projectB.id,
    assignments,
  };
}

async function noveltyCriterionId(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<string> {
  const criteria = (await startEvaluation(actor, eventId, assignmentId))
    .criteria;
  return criteria.find((c) => c.name === "Novelty")!.criterionId;
}

async function submitBoth(
  actor: Actor,
  eventId: string,
  scores: { projectA: number; projectB: number },
  assignments: Record<string, string>,
  judgeId: string,
  projectAId: string,
  projectBId: string,
): Promise<void> {
  for (const [projectId, value] of [
    [projectAId, scores.projectA],
    [projectBId, scores.projectB],
  ] as const) {
    const assignmentId = assignments[`${judgeId}-${projectId}`];
    const novelty = await noveltyCriterionId(actor, eventId, assignmentId);
    await submitEvaluation(actor, eventId, assignmentId, {
      scores: [{ criterionId: novelty, score: value }],
    });
  }
}

const rankingConfig = {
  normalizationStrategy: "z-score" as const,
  minimumBatchSize: 2,
  tieBreakers: ["secondary-score", "project-id"] as const,
};

describe("ranking snapshots", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("generates an immutable snapshot with intact versions and ordering", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );

    const snapshot = await generateRankingSnapshot(
      organizer,
      event.id,
      rankingConfig,
    );

    expect(snapshot.eventId).toBe(event.id);
    expect(snapshot.generatedBy).toBe(organizer.userId);
    expect(snapshot.generatedAt).toBeInstanceOf(Date);
    expect(snapshot.publishedAt).toBeNull();
    expect(snapshot.scoringVersion).toBe("1.0");
    expect(snapshot.normalizationVersion).toBe("1.0");
    expect(snapshot.rankingVersion).toBe("1.0");
    expect(snapshot.results.ranked).toHaveLength(2);
    expect(snapshot.results.ranked[0].projectId).toBe(projectAId);
    expect(snapshot.results.ranked[0].rank).toBe(1);
    expect(snapshot.results.ranked[1].projectId).toBe(projectBId);
    expect(snapshot.results.ranked[1].rank).toBe(2);
    expect(snapshot.configuration.tieBreakers).toEqual([
      "secondary-score",
      "project-id",
    ]);
  });

  it("persists a per-criterion breakdown for every ranked project", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );

    const snapshot = await generateRankingSnapshot(
      organizer,
      event.id,
      rankingConfig,
    );
    const criteria = snapshot.results.criteria!;

    expect(Object.keys(criteria)).toHaveLength(2);
    expect(Object.keys(criteria[projectAId])).toHaveLength(1);
    const novelA = Object.values(criteria[projectAId])[0];
    expect(novelA.name).toBe("Novelty");
    expect(novelA.meanWeightedScore).toBe(850);
    expect(novelA.scoredBy).toBe(2);

    const novelB = Object.values(criteria[projectBId])[0];
    expect(novelB.meanWeightedScore).toBe(450);
  });

  it("rejects generation outside the JUDGING state", async () => {
    const organizer = await registerUser({
      email: "org@rangate.test",
      password: "pass",
      displayName: "Org",
    });
    const event = await createEvent(actorFor(organizer.id), {
      slug: "rank-gate",
      name: "Gate Event",
      timezone: "UTC",
    });
    await transitionEvent(
      actorFor(organizer.id),
      event.id,
      "REGISTRATION",
    );

    await expect(
      generateRankingSnapshot(actorFor(organizer.id), event.id, rankingConfig),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects generation when no judging batch meets the minimum size", async () => {
    const { event, organizer, judgeA, judgeB, projectAId, projectBId, assignments } =
      await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );

    await expect(
      generateRankingSnapshot(organizer, event.id, {
        ...rankingConfig,
        minimumBatchSize: 3,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("lets only an organizer generate a snapshot", async () => {
    const { event, judgeA, projectAId, projectBId, assignments } =
      await scenario();

    await expect(
      generateRankingSnapshot(judgeA, event.id, rankingConfig),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 7, projectB: 3 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await expect(
      generateRankingSnapshot(judgeA, event.id, rankingConfig),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    void projectBId;
    void event;
  });

  it("keeps the published result identical even when current scores change", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );

    const snapshot = await generateRankingSnapshot(
      organizer,
      event.id,
      rankingConfig,
    );
    const frozenResults = JSON.stringify(snapshot.results);

    const judgeANovelty = await noveltyCriterionId(
      judgeA,
      event.id,
      assignments[`${judgeA.userId}-${projectAId}`],
    );

    const evaluations = await db
      .select()
      .from(schema.evaluations)
      .where(
        eq(
          schema.evaluations.assignmentId,
          assignments[`${judgeA.userId}-${projectAId}`],
        ),
      );
    expect(evaluations).toHaveLength(1);
    const evaluation = evaluations[0];

    await db
      .update(schema.evaluationScores)
      .set({ score: "1" })
      .where(
        and(
          eq(schema.evaluationScores.evaluationId, evaluation.id),
          eq(schema.evaluationScores.criterionId, judgeANovelty),
        ),
      );

    const reread = await getRankingSnapshot(
      organizer,
      event.id,
      snapshot.id,
    );
    expect(JSON.stringify(reread.results)).toBe(frozenResults);
    expect(reread.results.ranked[0].projectId).toBe(projectAId);
    void judgeB;
  });

  it("produces identical results across two generations from the same inputs", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );

    const first = await generateRankingSnapshot(organizer, event.id, rankingConfig);
    const second = await generateRankingSnapshot(organizer, event.id, rankingConfig);

    expect(second.id).not.toBe(first.id);
    expect(JSON.stringify(second.results)).toBe(JSON.stringify(first.results));
    expect(second.results.ranked[0].projectId).toBe(
      first.results.ranked[0].projectId,
    );
    expect(second.results.ranked[1].projectId).toBe(
      first.results.ranked[1].projectId,
    );
  });

  it("blocks non-organizers from reading unpublished results", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );
    const snapshot = await generateRankingSnapshot(
      organizer,
      event.id,
      rankingConfig,
    );

    await expect(
      getRankingSnapshot(judgeA, event.id, snapshot.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const published = await publishRankingSnapshot(
      organizer,
      event.id,
      snapshot.id,
    );
    expect(published.eventState).toBe("RESULTS_READY");
    expect(published.publishedAt).toBeInstanceOf(Date);

    const publicRead = await getRankingSnapshot(judgeA, event.id, snapshot.id);
    expect(publicRead.results).toEqual(snapshot.results);
  });

  it("publishes the snapshot and transitions the event to RESULTS_READY", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );
    const snapshot = await generateRankingSnapshot(
      organizer,
      event.id,
      rankingConfig,
    );

    const published = await publishRankingSnapshot(
      organizer,
      event.id,
      snapshot.id,
    );
    expect(published.snapshotId).toBe(snapshot.id);

    const [eventRow] = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, event.id));
    expect(eventRow.state).toBe("RESULTS_READY");
    expect(eventRow.publishedRankingSnapshotId).toBe(snapshot.id);

    const [snapshotRow] = await db
      .select()
      .from(schema.rankingSnapshots)
      .where(eq(schema.rankingSnapshots.id, snapshot.id));
    expect(snapshotRow.publishedAt).toBeInstanceOf(Date);

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, event.id));
    const actions = audits.map((a) => a.action).sort();
    expect(actions).toContain("ranking.generate");
    expect(actions).toContain("ranking.publish");
  });

  it("blocks publishing by a non-organizer", async () => {
    const {
      event,
      organizer,
      judgeA,
      judgeB,
      projectAId,
      projectBId,
      assignments,
    } = await scenario();

    await submitBoth(
      judgeA,
      event.id,
      { projectA: 9, projectB: 4 },
      assignments,
      judgeA.userId,
      projectAId,
      projectBId,
    );
    await submitBoth(
      judgeB,
      event.id,
      { projectA: 8, projectB: 5 },
      assignments,
      judgeB.userId,
      projectAId,
      projectBId,
    );
    const snapshot = await generateRankingSnapshot(
      organizer,
      event.id,
      rankingConfig,
    );

    await expect(
      publishRankingSnapshot(judgeA, event.id, snapshot.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      getRankingSnapshot(judgeA, event.id, snapshot.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});