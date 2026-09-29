import { beforeEach, describe, expect, it } from "vitest";

import { createSession } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { generateRankingSnapshot } from "@dogfood/ranking";

import { resetDb } from "../fixtures/db";
import {
  rankingScenario,
  RANKING_CONFIG,
  scoreBothJudges,
} from "../fixtures/ranking-scenario";
import * as bulkProjectLockRoute from "../../apps/web/app/api/v1/events/[eventId]/bulk/projects/lock/route";
import * as bulkEvaluationLockRoute from "../../apps/web/app/api/v1/events/[eventId]/bulk/evaluations/lock/route";
import * as startEvaluationRoute from "../../apps/web/app/api/v1/events/[eventId]/evaluations/[assignmentId]/start/route";
import * as reopenEvaluationRoute from "../../apps/web/app/api/v1/events/[eventId]/evaluations/[assignmentId]/reopen/route";
import * as lockEvaluationRoute from "../../apps/web/app/api/v1/events/[eventId]/evaluations/[assignmentId]/lock/route";
import * as publishRankingRoute from "../../apps/web/app/api/v1/events/[eventId]/rankings/[snapshotId]/publish/route";

const BASE = "http://dogfood.local";

async function cookieFor(userId: string): Promise<string> {
  const session = await createSession(userId);
  return `dogfood_session=${session.rawToken}`;
}

function request(method: string, path: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE}${path}`, { method, headers });
}

async function invoke(
  handler: (
    request: Request,
    context: { params: Promise<any> },
  ) => Promise<Response>,
  req: Request,
  params: Record<string, string>,
) {
  const response = await handler(req, { params: Promise.resolve(params) });
  return { response, body: await response.json() };
}

async function createSnapshot(scenario: Awaited<ReturnType<typeof rankingScenario>>) {
  await scoreBothJudges(scenario);
  return generateRankingSnapshot(scenario.organizer, scenario.event.id, RANKING_CONFIG);
}

describe("organizer REST operations", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("bulk locks submitted projects after the submission deadline and records the action", async () => {
    const scenario = await rankingScenario();
    const { event, organizer, projectAId, projectBId } = scenario;
    await db.update(schema.events)
      .set({ submissionClosesAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.events.id, event.id));

    const result = await invoke(
      bulkProjectLockRoute.POST,
      request("POST", `/api/v1/events/${event.id}/bulk/projects/lock`, await cookieFor(organizer.userId)),
      { eventId: event.id },
    );

    expect(result.response.status).toBe(200);
    expect(result.body).toEqual({ locked: 2 });
    const projects = await db.select().from(schema.projects)
      .where(eq(schema.projects.eventId, event.id));
    expect(projects).toHaveLength(2);
    expect(projects.every((project) => project.state === "LOCKED" && project.lockedAt instanceof Date)).toBe(true);
    expect(projects.map((project) => project.id).sort()).toEqual([projectAId, projectBId].sort());

    const audits = await db.select({ action: schema.auditEvents.action })
      .from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audits.map((entry) => entry.action)).toEqual(
      expect.arrayContaining(["project.lock", "project.lock_all"]),
    );
  });

  it("rejects a non-organizer bulk lock without changing project state", async () => {
    const scenario = await rankingScenario();
    const result = await invoke(
      bulkProjectLockRoute.POST,
      request("POST", `/api/v1/events/${scenario.event.id}/bulk/projects/lock`, await cookieFor(scenario.judgeA.userId)),
      { eventId: scenario.event.id },
    );

    expect(result.response.status).toBe(403);
    const projects = await db.select().from(schema.projects)
      .where(eq(schema.projects.eventId, scenario.event.id));
    expect(projects.every((project) => project.state !== "LOCKED")).toBe(true);
    const lockAudits = await db.select().from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, scenario.event.id));
    expect(lockAudits.some((entry) => entry.action === "project.lock_all")).toBe(false);
  });

  it("publishes a ranking snapshot for an organizer and keeps event, snapshot, and audit in sync", async () => {
    const scenario = await rankingScenario();
    const snapshot = await createSnapshot(scenario);
    const result = await invoke(
      publishRankingRoute.POST,
      request(
        "POST",
        `/api/v1/events/${scenario.event.id}/rankings/${snapshot.id}/publish`,
        await cookieFor(scenario.organizer.userId),
      ),
      { eventId: scenario.event.id, snapshotId: snapshot.id },
    );

    expect(result.response.status).toBe(200);
    expect(result.body.publication).toMatchObject({
      eventId: scenario.event.id,
      snapshotId: snapshot.id,
      eventState: "RESULTS_READY",
    });
    expect(result.body.publication.publishedAt).toBeTruthy();

    const [event] = await db.select().from(schema.events)
      .where(eq(schema.events.id, scenario.event.id));
    const [publishedSnapshot] = await db.select().from(schema.rankingSnapshots)
      .where(eq(schema.rankingSnapshots.id, snapshot.id));
    const audits = await db.select().from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, scenario.event.id));
    expect(event.state).toBe("RESULTS_READY");
    expect(event.publishedRankingSnapshotId).toBe(snapshot.id);
    expect(publishedSnapshot.publishedAt).toBeInstanceOf(Date);
    expect(audits.some((entry) => entry.action === "ranking.publish" && entry.resourceId === snapshot.id)).toBe(true);
  });

  it("rejects non-organizers and prevents publishing before judging starts", async () => {
    const scenario = await rankingScenario();
    const snapshot = await createSnapshot(scenario);
    const path = `/api/v1/events/${scenario.event.id}/rankings/${snapshot.id}/publish`;

    const denied = await invoke(
      publishRankingRoute.POST,
      request("POST", path, await cookieFor(scenario.judgeA.userId)),
      { eventId: scenario.event.id, snapshotId: snapshot.id },
    );
    expect(denied.response.status).toBe(403);

    // Simulate a persisted event that has not reached the ranking publication window.
    await db.update(schema.events).set({ state: "SUBMISSIONS_CLOSED" })
      .where(eq(schema.events.id, scenario.event.id));
    const tooEarly = await invoke(
      publishRankingRoute.POST,
      request("POST", path, await cookieFor(scenario.organizer.userId)),
      { eventId: scenario.event.id, snapshotId: snapshot.id },
    );
    expect(tooEarly.response.status).toBe(422);
    expect(tooEarly.body.error.code).toBe("VALIDATION_FAILED");

    const [unchangedSnapshot] = await db.select().from(schema.rankingSnapshots)
      .where(eq(schema.rankingSnapshots.id, snapshot.id));
    const [event] = await db.select().from(schema.events)
      .where(eq(schema.events.id, scenario.event.id));
    const audits = await db.select().from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, scenario.event.id));
    expect(unchangedSnapshot.publishedAt).toBeNull();
    expect(event.publishedRankingSnapshotId).toBeNull();
    expect(audits.some((entry) => entry.action === "ranking.publish")).toBe(false);
  });

  it("runs the evaluation lifecycle over REST and emits webhook-visible audit events", async () => {
    const scenario = await rankingScenario();
    const { event, organizer, judgeA, judgeB, projectAId } = scenario;
    const assignmentId = scenario.assignments[`${judgeA.userId}-${projectAId}`];
    const judgeCookie = await cookieFor(judgeA.userId);
    const organizerCookie = await cookieFor(organizer.userId);
    const path = `/api/v1/events/${event.id}/evaluations/${assignmentId}`;
    const params = { eventId: event.id, assignmentId };

    const started = await invoke(startEvaluationRoute.POST, request("POST", `${path}/start`, judgeCookie), params);
    expect(started.response.status).toBe(200);
    expect(started.body.evaluation.state).toBe("IN_PROGRESS");

    const denied = await invoke(
      startEvaluationRoute.POST,
      request("POST", `${path}/start`, await cookieFor(judgeB.userId)),
      params,
    );
    expect(denied.response.status).toBe(403);

    await scoreBothJudges(scenario);
    const reopened = await invoke(reopenEvaluationRoute.POST, request("POST", `${path}/reopen`, judgeCookie), params);
    expect(reopened.response.status).toBe(200);
    expect(reopened.body.evaluation.state).toBe("IN_PROGRESS");

    const judgeLock = await invoke(lockEvaluationRoute.POST, request("POST", `${path}/lock`, judgeCookie), params);
    expect(judgeLock.response.status).toBe(403);
    const reopenedLock = await invoke(lockEvaluationRoute.POST, request("POST", `${path}/lock`, organizerCookie), params);
    expect(reopenedLock.response.status).toBe(409);

    const otherId = scenario.assignments[`${judgeB.userId}-${projectAId}`];
    const locked = await invoke(
      lockEvaluationRoute.POST,
      request("POST", `/api/v1/events/${event.id}/evaluations/${otherId}/lock`, organizerCookie),
      { eventId: event.id, assignmentId: otherId },
    );
    expect(locked.response.status).toBe(200);
    expect(locked.body.evaluation.state).toBe("LOCKED");

    const bulk = await invoke(
      bulkEvaluationLockRoute.POST,
      request("POST", `/api/v1/events/${event.id}/bulk/evaluations/lock`, organizerCookie),
      { eventId: event.id },
    );
    expect(bulk.response.status).toBe(200);
    // The reopened (in-progress) evaluation is left for the judge to resubmit.
    expect(bulk.body).toEqual({ locked: 2 });
    const bulkDenied = await invoke(
      bulkEvaluationLockRoute.POST,
      request("POST", `/api/v1/events/${event.id}/bulk/evaluations/lock`, judgeCookie),
      { eventId: event.id },
    );
    expect(bulkDenied.response.status).toBe(403);

    const audits = await db.select({ action: schema.auditEvents.action })
      .from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audits.map((entry) => entry.action)).toEqual(expect.arrayContaining([
      "rubric.create",
      "rubric.criterion.create",
      "rubric.activate",
      "project.create",
      "evaluation.start",
      "evaluation.reopen",
      "evaluation.lock",
    ]));
  });
});
