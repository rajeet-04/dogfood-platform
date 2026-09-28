import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { createSession, registerUser } from "@dogfood/auth";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import {
  activateRubric,
  addCriterion,
  assignJudge,
  createRubric,
  lockEvaluation,
  startEvaluation,
} from "@dogfood/judging";
import { publishRankingSnapshot } from "@dogfood/ranking";
import { db, eq, schema } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../fixtures/db";
import * as eventsRoute from "../../apps/web/app/api/v1/events/route";
import * as eventDetailRoute from "../../apps/web/app/api/v1/events/[eventId]/route";
import * as teamsRoute from "../../apps/web/app/api/v1/events/[eventId]/teams/route";
import * as projectsRoute from "../../apps/web/app/api/v1/events/[eventId]/projects/route";
import * as judgeQueueRoute from "../../apps/web/app/api/v1/events/[eventId]/judge-queue/route";
import * as evaluationsRoute from "../../apps/web/app/api/v1/events/[eventId]/evaluations/[assignmentId]/route";
import * as rankingsRoute from "../../apps/web/app/api/v1/events/[eventId]/rankings/route";
import * as resultsRoute from "../../apps/web/app/api/v1/events/[eventId]/results/route";

const BASE = "http://dogfood.local";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

async function seedAuthUser(email: string, displayName = "Seed User") {
  const user = await registerUser({ email, password: "password123", displayName });
  const session = await createSession(user.id);
  const actor: Actor = { userId: user.id, isPlatformAdmin: false };
  return {
    userId: user.id,
    actor,
    email: user.email,
    cookie: `dogfood_session=${session.rawToken}`,
  };
}

async function seedRubric(
  organization: Actor,
  eventId: string,
  criteria: Array<{ name: string; weight: number; minScore: number; maxScore: number }>,
): Promise<string> {
  const rubric = await createRubric(organization, eventId, { name: "Main rubric" });
  for (const criterion of criteria) {
    await addCriterion(organization, rubric.id, criterion);
  }
  await activateRubric(organization, eventId, rubric.id);
  return rubric.id;
}

async function rubricCriterionIds(rubricId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.rubricCriteria.id })
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubricId))
    .orderBy(schema.rubricCriteria.sortOrder);
  return rows.map((row) => row.id);
}

type RouteHandler = (
  request: Request,
  ctx: { params: Promise<any> },
) => Promise<Response>;

function request(method: string, path: string, cookie?: string, body?: unknown): Request {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function invoke(
  handler: RouteHandler,
  req: Request,
  params: Record<string, string> = {},
): Promise<{ res: Response; body: { [key: string]: any } }> {
  const res = await handler(req, { params: Promise.resolve(params) });
  const body = await res.json();
  return { res, body };
}

describe("api/v1", () => {
  it("returns a stable typed error envelope when an evaluation is locked", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"));
    const judge = await seedAuthUser(uniqueEmail("judge"));
    const participant = await seedAuthUser(uniqueEmail("participant"));

    const event = await createEvent(organizer.actor, {
      name: "Hackathon",
      slug: "hackathon-locked",
      timezone: "UTC",
    });
    const rubricId = await seedRubric(organizer.actor, event.id, [
      { name: "Quality", weight: 100, minScore: 0, maxScore: 10 },
    ]);

    await grantEventMembership(organizer.actor, event.id, participant.userId, "PARTICIPANT");
    await transitionEvent(organizer.actor, event.id, "REGISTRATION");
    await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_OPEN");
    const team = await createTeam(participant.actor, event.id, { name: "Alpha Team" });
    const project = await createProject(participant.actor, event.id, {
      teamId: team.id,
      title: "Cool App",
      description: "A cool app.",
    });
    await submitProject(participant.actor, event.id, project.id);

    await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_CLOSED");
    await transitionEvent(organizer.actor, event.id, "JUDGING");

    await grantEventMembership(organizer.actor, event.id, judge.userId, "JUDGE");
    const assignment = await assignJudge(organizer.actor, event.id, {
      judgeId: judge.userId,
      projectId: project.id,
    });
    const criterionId = (await rubricCriterionIds(rubricId))[0];
    const scores = [{ criterionId, score: 8 }];

    await startEvaluation(judge.actor, event.id, assignment.id);

    const submitPath = `/api/v1/events/${event.id}/evaluations/${assignment.id}`;
    const submitted = await invoke(
      evaluationsRoute.POST,
      request("POST", submitPath, judge.cookie, { scores, overallComment: "Strong entry." }),
      { eventId: event.id, assignmentId: assignment.id },
    );
    expect(submitted.res.status).toBe(200);

    await lockEvaluation(organizer.actor, event.id, assignment.id);

    const locked = await invoke(
      evaluationsRoute.POST,
      request("POST", submitPath, judge.cookie, { scores, overallComment: "Changed my mind." }),
      { eventId: event.id, assignmentId: assignment.id },
    );

    expect(locked.res.status).toBe(409);
    expect(Object.keys(locked.body)).toEqual(["error"]);
    expect(locked.body.error.code).toBe("EVALUATION_LOCKED");
    expect(typeof locked.body.error.message).toBe("string");
    expect(locked.body.error.message.length).toBeGreaterThan(0);
    expect(typeof locked.body.error.requestId).toBe("string");
    expect(locked.res.headers.get("x-request-id")).toBe(locked.body.error.requestId);
  });

  it("exposes thin handlers for events, teams, projects, judging, and rankings", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"));
    const judge = await seedAuthUser(uniqueEmail("judge"));
    const participant = await seedAuthUser(uniqueEmail("participant"));

    const createResponse = await invoke(
      eventsRoute.POST,
      request("POST", "/api/v1/events", organizer.cookie, {
        slug: "hackathon-thin",
        name: "Hackathon",
        timezone: "UTC",
      }),
    );
    expect(createResponse.res.status).toBe(201);
    const eventId = createResponse.body.event.id;

    const listResponse = await invoke(
      eventsRoute.GET,
      request("GET", "/api/v1/events?q=Hackathon", organizer.cookie),
    );
    expect(listResponse.res.status).toBe(200);
    expect(listResponse.body.events.some((e: any) => e.slug === "hackathon-thin")).toBe(true);

    const detailResponse = await invoke(
      eventDetailRoute.GET,
      request("GET", `/api/v1/events/${eventId}`, organizer.cookie),
      { eventId },
    );
    expect(detailResponse.res.status).toBe(200);
    expect(detailResponse.body.event.myRoles).toContain("ORGANIZER");
    expect(detailResponse.body.event.state).toBe("DRAFT");

    const publicDetail = await invoke(
      eventDetailRoute.GET,
      request("GET", `/api/v1/events/${eventId}`),
      { eventId },
    );
    expect(publicDetail.res.status).toBe(200);
    expect(publicDetail.body.event.myRoles).toEqual([]);

    const missing = await invoke(
      eventDetailRoute.GET,
      request("GET", `/api/v1/events/00000000-0000-4000-8000-000000000000`),
      { eventId: randomUUID() },
    );
    expect(missing.res.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");

    await grantEventMembership(organizer.actor, eventId, participant.userId, "PARTICIPANT");
    await transitionEvent(organizer.actor, eventId, "REGISTRATION");
    await transitionEvent(organizer.actor, eventId, "SUBMISSIONS_OPEN");

    const teamResponse = await invoke(
      teamsRoute.POST,
      request("POST", `/api/v1/events/${eventId}/teams`, participant.cookie, { name: "Bravo Team" }),
      { eventId },
    );
    expect(teamResponse.res.status).toBe(201);

    const projectResponse = await invoke(
      projectsRoute.POST,
      request("POST", `/api/v1/events/${eventId}/projects`, participant.cookie, {
        teamId: teamResponse.body.team.id,
        title: "Neat App",
        description: "Quite neat.",
        techTags: ["typescript"],
      }),
      { eventId },
    );
    expect(projectResponse.res.status).toBe(201);
    const projectId = projectResponse.body.project.id;

    const rubricId = await seedRubric(organizer.actor, eventId, [
      { name: "Quality", weight: 100, minScore: 0, maxScore: 10 },
    ]);
    await transitionEvent(organizer.actor, eventId, "SUBMISSIONS_CLOSED");
    await transitionEvent(organizer.actor, eventId, "JUDGING");

    await grantEventMembership(organizer.actor, eventId, judge.userId, "JUDGE");
    const assignment = await assignJudge(organizer.actor, eventId, {
      judgeId: judge.userId,
      projectId,
    });
    await startEvaluation(judge.actor, eventId, assignment.id);

    const queueResponse = await invoke(
      judgeQueueRoute.GET,
      request("GET", `/api/v1/events/${eventId}/judge-queue`, judge.cookie),
      { eventId },
    );
    expect(queueResponse.res.status).toBe(200);
    expect(queueResponse.body.items).toHaveLength(1);

    const criterionId = (await rubricCriterionIds(rubricId))[0];
    const scores = [{ criterionId, score: 9 }];

    const evaluationPath = `/api/v1/events/${eventId}/evaluations/${assignment.id}`;
    const getEvaluationResponse = await invoke(
      evaluationsRoute.GET,
      request("GET", evaluationPath, judge.cookie),
      { eventId, assignmentId: assignment.id },
    );
    expect(getEvaluationResponse.res.status).toBe(200);

    const draftResponse = await invoke(
      evaluationsRoute.PUT,
      request("PUT", evaluationPath, judge.cookie, { scores }),
      { eventId, assignmentId: assignment.id },
    );
    expect(draftResponse.res.status).toBe(200);

    const submitResponse = await invoke(
      evaluationsRoute.POST,
      request("POST", evaluationPath, judge.cookie, { scores, overallComment: "Great." }),
      { eventId, assignmentId: assignment.id },
    );
    expect(submitResponse.res.status).toBe(200);

    const generateResponse = await invoke(
      rankingsRoute.POST,
      request("POST", `/api/v1/events/${eventId}/rankings`, organizer.cookie, {
        normalizationStrategy: "z-score",
      }),
      { eventId },
    );
    expect(generateResponse.res.status).toBe(201);

    const rankingsResponse = await invoke(
      rankingsRoute.GET,
      request("GET", `/api/v1/events/${eventId}/rankings`, organizer.cookie),
      { eventId },
    );
    expect(rankingsResponse.res.status).toBe(200);
    expect(rankingsResponse.body.items.length).toBeGreaterThan(0);

    const resultsBefore = await invoke(
      resultsRoute.GET,
      request("GET", `/api/v1/events/${eventId}/results`),
      { eventId },
    );
    expect(resultsBefore.res.status).toBe(404);

    await publishRankingSnapshot(
      organizer.actor,
      eventId,
      generateResponse.body.snapshot.id,
    );

    const resultsAfter = await invoke(
      resultsRoute.GET,
      request("GET", `/api/v1/events/${eventId}/results`),
      { eventId },
    );
    expect(resultsAfter.res.status).toBe(200);
    expect(resultsAfter.body.results.rankings).toHaveLength(1);
    expect(resultsAfter.body.results.rankings[0]).toMatchObject({
      rank: 1,
      projectId,
    });
    expect(resultsAfter.body.results.rankings[0].criteria.length).toBe(1);
    expect(
      resultsAfter.body.results.rankings[0].criteria[0].criterionId,
    ).toBe(criterionId);
  });

  it("lists only public events and validates query params", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"));
    const pub = await createEvent(organizer.actor, {
      name: "Public Hack",
      slug: "public-hack",
      timezone: "UTC",
    });
    const draft = await createEvent(organizer.actor, {
      name: "Hidden Draft",
      slug: "hidden-draft",
      timezone: "UTC",
    });
    const archived = await createEvent(organizer.actor, {
      name: "Old Hack",
      slug: "old-hack",
      timezone: "UTC",
    });
    await transitionEvent(organizer.actor, pub.id, "REGISTRATION");
    await transitionEvent(organizer.actor, archived.id, "REGISTRATION");
    await transitionEvent(organizer.actor, archived.id, "SUBMISSIONS_OPEN");
    await transitionEvent(organizer.actor, archived.id, "SUBMISSIONS_CLOSED");
    await transitionEvent(organizer.actor, archived.id, "JUDGING");
    await transitionEvent(organizer.actor, archived.id, "RESULTS_READY");
    await transitionEvent(organizer.actor, archived.id, "PUBLISHED");
    await transitionEvent(organizer.actor, archived.id, "ARCHIVED");

    const anonymous = await invoke(
      eventsRoute.GET,
      request("GET", "/api/v1/events"),
    );
    expect(anonymous.res.status).toBe(200);
    const anonSlugs = anonymous.body.events.map((e: any) => e.slug);
    expect(anonSlugs).toContain("public-hack");
    expect(anonSlugs).not.toContain("hidden-draft");
    expect(anonSlugs).not.toContain("old-hack");

    const owner = await invoke(
      eventsRoute.GET,
      request("GET", "/api/v1/events", organizer.cookie),
    );
    expect(owner.body.events.map((e: any) => e.slug)).toContain("hidden-draft");
    expect(owner.body.events.map((e: any) => e.slug)).toContain("old-hack");

    const stateFilter = await invoke(
      eventsRoute.GET,
      request("GET", "/api/v1/events?state=REGISTRATION", organizer.cookie),
    );
    expect(stateFilter.body.events.map((e: any) => e.slug)).toEqual([
      "public-hack",
    ]);

    const invalidState = await invoke(
      eventsRoute.GET,
      request("GET", "/api/v1/events?state=banana"),
    );
    expect(invalidState.res.status).toBe(422);
    expect(invalidState.body.error.code).toBe("VALIDATION_FAILED");
  });

  it("rejects direct authorization bypass attempts", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"));
    const judge = await seedAuthUser(uniqueEmail("judge"));
    const participant = await seedAuthUser(uniqueEmail("participant"));

    const unauthenticatedCreate = await invoke(
      eventsRoute.POST,
      request("POST", "/api/v1/events", undefined, {
        slug: "noguest",
        name: "No Guests",
        timezone: "UTC",
      }),
    );
    expect(unauthenticatedCreate.res.status).toBe(401);
    expect(unauthenticatedCreate.body.error.code).toBe("UNAUTHENTICATED");

    const event = await createEvent(organizer.actor, {
      name: "Hackathon",
      slug: "hackathon-authz",
      timezone: "UTC",
    });

    const unauthenticatedQueue = await invoke(
      judgeQueueRoute.GET,
      request("GET", `/api/v1/events/${event.id}/judge-queue`),
      { eventId: event.id },
    );
    expect(unauthenticatedQueue.res.status).toBe(401);

    await grantEventMembership(organizer.actor, event.id, participant.userId, "PARTICIPANT");
    await grantEventMembership(organizer.actor, event.id, judge.userId, "JUDGE");

    const participantQueue = await invoke(
      judgeQueueRoute.GET,
      request("GET", `/api/v1/events/${event.id}/judge-queue`, participant.cookie),
      { eventId: event.id },
    );
    expect(participantQueue.res.status).toBe(403);
    expect(participantQueue.body.error.code).toBe("FORBIDDEN");

    const judgeCreateTeam = await invoke(
      teamsRoute.POST,
      request("POST", `/api/v1/events/${event.id}/teams`, judge.cookie, {
        name: "Sneaky Team",
      }),
      { eventId: event.id },
    );
    expect(judgeCreateTeam.res.status).toBe(403);
    expect(judgeCreateTeam.body.error.code).toBe("FORBIDDEN");

    const invalidJson = await invoke(
      teamsRoute.POST,
      request("POST", `/api/v1/events/${event.id}/teams`, participant.cookie, "not json"),
      { eventId: event.id },
    );
    expect(invalidJson.res.status).toBe(422);
    expect(invalidJson.body.error.code).toBe("VALIDATION_FAILED");

    const missingField = await invoke(
      teamsRoute.POST,
      request("POST", `/api/v1/events/${event.id}/teams`, participant.cookie, {}),
      { eventId: event.id },
    );
    expect(missingField.res.status).toBe(422);
    expect(missingField.body.error.code).toBe("VALIDATION_FAILED");
    expect(missingField.body.error.fields.name).toBeTruthy();
  });
});