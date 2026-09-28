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
    const ranking = await rankingRoute.POST(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-ranking`, {
        method: "POST",
        headers: { cookie: `dogfood_session=${organizerSession.rawToken}`, "content-type": "application/json" },
        body: JSON.stringify({ projectIds: projects.slice(0, 2) }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(ranking.status).toBe(200);
    expect((await ranking.json()).ranking.ranked[0].projectId).toBe(projects[1]);

    const rejected = await pairwiseRoute.POST(
      request(`http://dogfood.local/api/v1/events/${event.id}/pairwise-comparisons`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerProjectId: projects[0], loserProjectId: projects[2] }),
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(rejected.status).toBe(403);
  });
});
