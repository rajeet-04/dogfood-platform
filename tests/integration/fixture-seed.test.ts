import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { db, eq, schema } from "@dogfood/db";
import { seedOfficialFixture, type OfficialFixture } from "../../packages/db/src/fixture-seed";
import { resetDb } from "../fixtures/db";

const fixture = JSON.parse(
  await readFile(join(process.cwd(), "fixtures.json"), "utf8"),
) as OfficialFixture;

describe("official fixture seed", () => {
  it("loads canonical records once and preserves the duplicate submission with its scores", async () => {
    await resetDb();
    const first = await seedOfficialFixture(fixture);
    const second = await seedOfficialFixture(fixture);
    expect(second).toEqual(first);
    expect(first.counts).toEqual({
      tracks: 8, judges: 30, teams: 40, projects: 40, scores: 122, anomalies: 1,
    });

    const [event] = await db.select().from(schema.events)
      .where(eq(schema.events.id, first.eventId));
    expect(event.submissionClosesAt?.getTime()).toBe(Date.parse(fixture.event.submissions_close));
    expect(event.state).toBe("JUDGING");

    const projects = await db.select().from(schema.projects)
      .where(eq(schema.projects.eventId, first.eventId));
    const revisions = await db.select().from(schema.projectRevisions);
    const tracks = await db.select().from(schema.eventTracks)
      .where(eq(schema.eventTracks.eventId, first.eventId));
    const judges = await db.select().from(schema.eventMemberships)
      .where(eq(schema.eventMemberships.eventId, first.eventId));
    const assignments = await db.select().from(schema.judgeAssignments)
      .where(eq(schema.judgeAssignments.eventId, first.eventId));
    const evaluations = await db.select().from(schema.evaluations);
    const scores = await db.select().from(schema.evaluationScores);
    expect(projects).toHaveLength(40);
    expect(revisions).toHaveLength(40);
    expect(tracks).toHaveLength(8);
    expect(judges.filter((member) => member.role === "JUDGE")).toHaveLength(30);
    expect(assignments).toHaveLength(122);
    expect(evaluations).toHaveLength(122);
    expect(scores).toHaveLength(366);
    expect(projects.every((project) => project.state === "SUBMITTED" && project.currentRevisionId)).toBe(true);

    const [anomaly] = await db.select().from(schema.fixtureImportAnomalies)
      .where(eq(schema.fixtureImportAnomalies.eventId, first.eventId));
    expect(anomaly.sourceProjectId).toBe("prj_41");
    expect(anomaly.canonicalSourceProjectId).toBe("prj_07");
    expect(anomaly.scoreRecords).toHaveLength(4);
    expect(anomaly.projectRecord.team).toBe("tm_07");
    expect(first.projectIds.prj_41).toBeUndefined();
  });
});
