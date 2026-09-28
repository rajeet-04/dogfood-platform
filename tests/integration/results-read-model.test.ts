import { beforeEach, describe, expect, it } from "vitest";

import {
  generateRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";
import { db, eq, schema } from "@dogfood/db";
import { transitionEvent } from "@dogfood/events";

import { getEventResults } from "../../apps/web/server/read-models/results";
import { resetDb } from "../fixtures/db";
import {
  rankingScenario,
  RANKING_CONFIG,
  scoreBothJudges,
} from "../fixtures/ranking-scenario";

describe("event results read model", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns null when the event has no ranking snapshot", async () => {
    const { event } = await rankingScenario();

    expect(await getEventResults(event.id)).toBeNull();
    expect(
      await getEventResults(event.id, { includeUnpublished: true }),
    ).toBeNull();
  });

  it("hides an unpublished snapshot from participants and the public", async () => {
    const scenario = await rankingScenario();
    await scoreBothJudges(scenario);
    await generateRankingSnapshot(
      scenario.organizer,
      scenario.event.id,
      RANKING_CONFIG,
    );

    expect(await getEventResults(scenario.event.id)).toBeNull();
  });

  it("lets organizers preview an unpublished snapshot with scores", async () => {
    const scenario = await rankingScenario();
    await scoreBothJudges(scenario);
    const snapshot = await generateRankingSnapshot(
      scenario.organizer,
      scenario.event.id,
      RANKING_CONFIG,
    );

    const results = await getEventResults(scenario.event.id, {
      includeUnpublished: true,
    });

    expect(results).not.toBeNull();
    expect(results!.snapshotId).toBe(snapshot.id);
    expect(results!.publishedAt).toBeNull();
    expect(results!.entries).toHaveLength(2);

    const [first] = results!.entries;
    expect(first.rank).toBe(1);
    expect(first.projectTitle).toBe("Project A");
    expect(first.teamName).toBe("Team A");
    expect(Number.isFinite(first.score)).toBe(true);
    expect(first.weightedTotal).toBe(850);
    expect(first.criteria).toEqual([
      {
        criterionId: expect.any(String),
        name: "Novelty",
        meanWeightedScore: 850,
        scoredBy: 2,
      },
    ]);
  });

  it("returns ranked scores, teams and criteria once results are published", async () => {    const scenario = await rankingScenario();
    await scoreBothJudges(scenario);
    const snapshot = await generateRankingSnapshot(
      scenario.organizer,
      scenario.event.id,
      RANKING_CONFIG,
    );
    await publishRankingSnapshot(
      scenario.organizer,
      scenario.event.id,
      snapshot.id,
    );

    const results = await getEventResults(scenario.event.id);

    expect(results).not.toBeNull();
    expect(results!.publishedAt).toBeInstanceOf(Date);
    expect(results!.entries.map((entry) => entry.projectTitle)).toEqual([
      "Project A",
      "Project B",
    ]);
    expect(results!.entries.map((entry) => entry.teamName)).toEqual([
      "Team A",
      "Team B",
    ]);
    expect(results!.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(results!.entries[0].projectId).toBe(scenario.projectAId);
    expect(results!.entries[0].score).toBeGreaterThan(
      results!.entries[1].score,
    );
    expect(results!.entries[0].weightedTotal).toBe(850);
    expect(results!.entries[1].weightedTotal).toBe(450);
    expect(results!.entries[0].criteria[0].name).toBe("Novelty");
    expect(results!.entries[0].criteria[0].scoredBy).toBe(2);
  });

  it("can still rank and publish an event that was advanced past judging", async () => {
    const scenario = await rankingScenario();
    await scoreBothJudges(scenario);
    await transitionEvent(
      scenario.organizer,
      scenario.event.id,
      "RESULTS_READY",
    );
    await transitionEvent(scenario.organizer, scenario.event.id, "PUBLISHED");

    // Participants see nothing yet: no snapshot has been published
    expect(await getEventResults(scenario.event.id)).toBeNull();

    const snapshot = await generateRankingSnapshot(
      scenario.organizer,
      scenario.event.id,
      RANKING_CONFIG,
    );
    const published = await publishRankingSnapshot(
      scenario.organizer,
      scenario.event.id,
      snapshot.id,
    );

    // Publishing must not rewind a published event back to RESULTS_READY
    expect(published.eventState).toBe("PUBLISHED");
    const [eventRow] = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, scenario.event.id));
    expect(eventRow.state).toBe("PUBLISHED");
    expect(eventRow.publishedRankingSnapshotId).toBe(snapshot.id);

    const results = await getEventResults(scenario.event.id);
    expect(results).not.toBeNull();
    expect(results!.entries).toHaveLength(2);
  });
});
