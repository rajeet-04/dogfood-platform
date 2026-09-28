import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { and, db, eq, schema } from "@dogfood/db";
import { createEvent, transitionEvent } from "@dogfood/events";
import {
  generateRankingSnapshot,
  getRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";

import { resetDb } from "../fixtures/db";
import {
  actorFor,
  noveltyCriterionId,
  rankingScenario as scenario,
  RANKING_CONFIG as rankingConfig,
  submitBoth,
} from "../fixtures/ranking-scenario";

const rankingConfigUnused = {
  normalizationStrategy: "z-score" as const,
  minimumBatchSize: 2,
  tieBreakers: ["secondary-score", "project-id"] as const,
};
void rankingConfigUnused;
void actorFor;

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
