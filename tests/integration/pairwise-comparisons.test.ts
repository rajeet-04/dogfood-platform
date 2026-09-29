import { db, eq, schema } from "@dogfood/db";
import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import { assignJudge } from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../fixtures/db";
import * as pairwiseRoute from "../../apps/web/app/api/v1/events/[eventId]/pairwise-comparisons/route";
import * as rankingRoute from "../../apps/web/app/api/v1/events/[eventId]/pairwise-ranking/route";
import * as pairwiseResultsRoute from "../../apps/web/app/api/v1/events/[eventId]/pairwise-results/route";
import * as publishPairwiseRoute from "../../apps/web/app/api/v1/events/[eventId]/pairwise-ranking/[snapshotId]/publish/route";

const actorFor = (userId: string): Actor => ({ userId, isPlatformAdmin: false });

describe("assigned judge pairwise comparisons", () => {
  beforeEach(async () => resetDb());

  it("persists an assigned judge's choice and rejects unassigned projects", async () => {
    const organizerUser = await registerUser({ email: "pair-org@example.com", password: "pass", displayName: "Organizer" });
    const ownerUsers = await Promise.all(["one", "two", "three"].map((label) => registerUser({ email: `pair-owner-${label}@example.com`, password: "pass", displayName: `Owner ${label}` })));
    const judgeUser = await registerUser({ email: "pair-judge@example.com", password: "pass", displayName: "Judge" });
    const organizer = actorFor(organizerUser.id);
    const judge = actorFor(judgeUser.id);
    const event = await createEvent(organizer, { slug: "pairwise-collection", name: "Pairwise collection", timezone: "UTC" });
    await transitionEvent(organizer, event.id, "REGISTRATION");
    for (const user of ownerUsers) await grantEventMembership(organizer, event.id, user.id, "PARTICIPANT");
    await grantEventMembership(organizer, event.id, judge.userId, "JUDGE");
    const projects: string[] = [];
    const teams = await Promise.all(["One", "Two", "Three"].map((name, index) => createTeam(actorFor(ownerUsers[index].id), event.id, { name: `Team ${name}` })));

    await transitionEvent(organizer, event.id, "SUBMISSIONS_OPEN");
    for (const [index, name] of ["One", "Two", "Three"].entries()) {
      const owner = actorFor(ownerUsers[index].id);
      const project = await createProject(owner, event.id, { teamId: teams[index].id, title: `Project ${name}`, description: "Submitted project" });
      await submitProject(owner, event.id, project.id);
      projects.push(project.id);
    }
    await transitionEvent(organizer, event.id, "SUBMISSIONS_CLOSED");
    await assignJudge(organizer, event.id, { judgeId: judge.userId, projectId: projects[0] });
    await assignJudge(organizer, event.id, { judgeId: judge.userId, projectId: projects[1] });
    await transitionEvent(organizer, event.id, "JUDGING");
    const session = await createSession(judge.userId);
    const request = (url: string, init: RequestInit = {}) => new Request(url, {
      ...init,
      headers: { cookie: `dogfood_session=${session.rawToken}`, ...(init.headers as Record<string, string> | undefined) },
    });

    const saved = await pairwiseRoute.POST(
      request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-comparisons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerProjectId: projects[0], loserProjectId: projects[1] }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(saved.status).toBe(200);

    const listed = await pairwiseRoute.GET(
      request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-comparisons`),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(await listed.json()).toMatchObject({
      projects: expect.arrayContaining([
        expect.objectContaining({ id: projects[0] }),
        expect.objectContaining({ id: projects[1] }),
      ]),
      comparisons: [{ winnerProjectId: projects[0], loserProjectId: projects[1] }],
    });

    const updated = await pairwiseRoute.POST(
      request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-comparisons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerProjectId: projects[1], loserProjectId: projects[0] }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(updated.status).toBe(200);
    const organizerSession = await createSession(organizer.userId);
    const judgeRankingAttempt = await rankingRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${session.rawToken}`, "content-type": "application/json" },
        body: JSON.stringify({ projectIds: projects.slice(0, 2) }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(judgeRankingAttempt.status).toBe(403);
    const generated = await rankingRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}`, "content-type": "application/json" },
        body: JSON.stringify({ projectIds: projects.slice(0, 2) }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(generated.status).toBe(201);
    const generatedBody = await generated.json();
    expect(generatedBody.ranking.ranked[0].projectId).toBe(projects[1]);
    expect(generatedBody.snapshot.input.comparisons).toHaveLength(1);
    expect(generatedBody.snapshot.input.comparisons[0]).toMatchObject({
      judgeId: judge.userId,
      winnerProjectId: projects[1],
      loserProjectId: projects[0],
    });

    const hidden = await pairwiseResultsRoute.GET(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-results`),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(hidden.status).toBe(404);

    const published = await publishPairwiseRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking/${generatedBody.snapshot.id}/publish`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}` },
      }),
      { params: Promise.resolve({ eventId: event.id, snapshotId: generatedBody.snapshot.id }) },
    );
    expect(published.status).toBe(200);
    const visible = await pairwiseResultsRoute.GET(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-results`),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(await visible.json()).toMatchObject({
      results: {
        snapshotId: generatedBody.snapshot.id,
        rankings: generatedBody.snapshot.results.ranked,
      },
    });

    const changedChoice = await pairwiseRoute.POST(
      request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-comparisons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerProjectId: projects[0], loserProjectId: projects[1] }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(changedChoice.status).toBe(200);

    const regenerated = await rankingRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}`, "content-type": "application/json" },
        body: JSON.stringify({ projectIds: projects.slice(0, 2) }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(regenerated.status).toBe(201);
    const regeneratedBody = await regenerated.json();
    expect(regeneratedBody.snapshot.results).not.toEqual(generatedBody.snapshot.results);
    expect(regeneratedBody.snapshot.supersedesSnapshotId).toBe(generatedBody.snapshot.id);

    const republished = await publishPairwiseRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking/${regeneratedBody.snapshot.id}/publish`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}` },
      }),
      { params: Promise.resolve({ eventId: event.id, snapshotId: regeneratedBody.snapshot.id }) },
    );
    expect(republished.status).toBe(200);
    const latestVisible = await pairwiseResultsRoute.GET(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-results`),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect((await latestVisible.json()).results.snapshotId).toBe(regeneratedBody.snapshot.id);

    const originalSnapshot = await rankingRoute.GET(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking?snapshotId=${generatedBody.snapshot.id}`, {
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}` },
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(await originalSnapshot.json()).toMatchObject({
      snapshot: {
        id: generatedBody.snapshot.id,
        input: generatedBody.snapshot.input,
        results: generatedBody.snapshot.results,
        supersedesSnapshotId: null,
      },
    });

    const makeSnapshot = async () => rankingRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}`, "content-type": "application/json" },
        body: JSON.stringify({ projectIds: projects.slice(0, 2) }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    const [nextOne, nextTwo] = await Promise.all([makeSnapshot(), makeSnapshot()]);
    expect(nextOne.status).toBe(201);
    expect(nextTwo.status).toBe(201);
    const nextOneBody = await nextOne.json();
    const nextTwoBody = await nextTwo.json();
    const [publishOne, publishTwo] = await Promise.all([
      publishPairwiseRoute.POST(
        new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking/${nextOneBody.snapshot.id}/publish`, {
          method: "POST",
          headers: { cookie: `dogfood_session=${organizerSession.rawToken}` },
        }),
        { params: Promise.resolve({ eventId: event.id, snapshotId: nextOneBody.snapshot.id }) },
      ),
      publishPairwiseRoute.POST(
        new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking/${nextTwoBody.snapshot.id}/publish`, {
          method: "POST",
          headers: { cookie: `dogfood_session=${organizerSession.rawToken}` },
        }),
        { params: Promise.resolve({ eventId: event.id, snapshotId: nextTwoBody.snapshot.id }) },
      ),
    ]);
    expect(publishOne.status).toBe(200);
    expect(publishTwo.status).toBe(200);
    const publicationLinks = [await publishOne.json(), await publishTwo.json()]
      .map((body) => body.publication.supersedesSnapshotId);
    expect(new Set(publicationLinks).size).toBe(2);

    const rejected = await pairwiseRoute.POST(
      request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-comparisons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerProjectId: projects[0], loserProjectId: projects[2] }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(rejected.status).toBe(403);

    // Policy: pairwise is a separate, organizer-published ranking and never mixes with rubric scoring.
    const [rubricEvent] = await db.select({ published: schema.events.publishedRankingSnapshotId })
      .from(schema.events).where(eq(schema.events.id, event.id));
    expect(rubricEvent.published).toBeNull();
    const rubricRows = await db.select({ id: schema.evaluations.id }).from(schema.evaluations);
    expect(rubricRows).toHaveLength(0);
  });
});
