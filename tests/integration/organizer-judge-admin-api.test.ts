import { and, db, eq, schema } from "@dogfood/db";
import { createSession, registerUser } from "@dogfood/auth";
import { createEvent, transitionEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";
import { beforeEach, describe, expect, it } from "vitest";

import * as applicationsRoute from "../../apps/web/app/api/v1/events/[eventId]/judge-applications/route";
import * as applicationRoute from "../../apps/web/app/api/v1/events/[eventId]/judge-applications/[applicationId]/route";
import * as judgeRoute from "../../apps/web/app/api/v1/events/[eventId]/judges/[userId]/route";
import * as rubricsRoute from "../../apps/web/app/api/v1/events/[eventId]/rubrics/route";
import * as criteriaRoute from "../../apps/web/app/api/v1/events/[eventId]/rubrics/[rubricId]/criteria/route";
import * as activateRoute from "../../apps/web/app/api/v1/events/[eventId]/rubrics/[rubricId]/activate/route";
import { resetDb } from "../fixtures/db";

let counter = 0;

async function user(label: string) {
  counter += 1;
  const account = await registerUser({
    email: `${label}-${Date.now()}-${counter}@judge-admin.test`,
    password: "password123",
    displayName: label,
  });
  const session = await createSession(account.id);
  return {
    id: account.id,
    email: account.email,
    actor: { userId: account.id, isPlatformAdmin: false } satisfies Actor,
    cookie: `dogfood_session=${session.rawToken}`,
  };
}

function request(method: string, path: string, cookie?: string, body?: unknown): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://dogfood.local${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function invoke(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
  req: Request,
  params: Record<string, string>,
) {
  const response = await handler(req, { params });
  return { response, body: await response.json() as Record<string, any> };
}

describe("judge administration REST API", () => {
  beforeEach(async () => {
    counter = 0;
    await resetDb();
  });

  it("applies, lists, decides, and deactivates judges within the event scope", async () => {
    const organizer = await user("organizer");
    const applicant = await user("applicant");
    const outsider = await user("outsider");
    const event = await createEvent(organizer.actor, {
      slug: `judge-admin-${Date.now()}`,
      name: "Judge Admin",
      timezone: "UTC",
    });
    await transitionEvent(organizer.actor, event.id, "REGISTRATION");
    const params = { eventId: event.id };
    const base = `/api/v1/events/${event.id}/judge-applications`;

    const unauthenticated = await invoke(applicationsRoute.POST, request("POST", base, undefined, {}), params);
    expect(unauthenticated.response.status).toBe(401);

    const applied = await invoke(applicationsRoute.POST, request("POST", base, applicant.cookie, { rationale: "I have prior experience." }), params);
    expect(applied.response.status).toBe(201);
    expect(applied.body.application).toMatchObject({ status: "pending", rationale: "I have prior experience." });
    const own = await invoke(applicationsRoute.GET, request("GET", base, applicant.cookie), params);
    expect(own.body.application).toMatchObject({ id: applied.body.application.id, status: "pending" });

    const deniedList = await invoke(applicationsRoute.GET, request("GET", base, outsider.cookie), params);
    expect(deniedList.response.status).toBe(200);
    expect(deniedList.body).toEqual({ application: null });
    const listed = await invoke(applicationsRoute.GET, request("GET", base, organizer.cookie), params);
    expect(listed.body.applications).toHaveLength(1);
    expect(listed.body.applications[0]).toMatchObject({ id: applied.body.application.id, userId: applicant.id });

    const deniedDecision = await invoke(applicationRoute.PATCH, request("PATCH", `${base}/${applied.body.application.id}`, outsider.cookie, { decision: "approve" }), { ...params, applicationId: applied.body.application.id });
    expect(deniedDecision.response.status).toBe(403);
    const approved = await invoke(applicationRoute.PATCH, request("PATCH", `${base}/${applied.body.application.id}`, organizer.cookie, { decision: "approve" }), { ...params, applicationId: applied.body.application.id });
    expect(approved.body.application.status).toBe("approved");

    const auditRows = await db.select({ action: schema.auditEvents.action }).from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(auditRows.map((row) => row.action)).toEqual(expect.arrayContaining(["judge_application.apply", "judge_application.approve"]));
    const approvedNotifications = await db.select({ type: schema.notifications.type }).from(schema.notifications).where(and(eq(schema.notifications.eventId, event.id), eq(schema.notifications.userId, applicant.id)));
    expect(approvedNotifications.map((row) => row.type)).toContain("judge_application_approved");

    const foreignEvent = await createEvent(outsider.actor, { slug: `foreign-${Date.now()}`, name: "Foreign", timezone: "UTC" });
    const wrongScope = await invoke(applicationRoute.PATCH, request("PATCH", `/api/v1/events/${foreignEvent.id}/judge-applications/${applied.body.application.id}`, outsider.cookie, { decision: "reject" }), { eventId: foreignEvent.id, applicationId: applied.body.application.id });
    expect(wrongScope.response.status).toBe(404);

    const deniedDeactivate = await invoke(judgeRoute.DELETE, request("DELETE", `/api/v1/events/${event.id}/judges/${applicant.id}`, outsider.cookie), { eventId: event.id, userId: applicant.id });
    expect(deniedDeactivate.response.status).toBe(403);
    const deactivated = await invoke(judgeRoute.DELETE, request("DELETE", `/api/v1/events/${event.id}/judges/${applicant.id}`, organizer.cookie), { eventId: event.id, userId: applicant.id });
    expect(deactivated.body).toEqual({ deactivated: true });
    const judgeMemberships = await db.select().from(schema.eventMemberships).where(and(eq(schema.eventMemberships.eventId, event.id), eq(schema.eventMemberships.userId, applicant.id)));
    expect(judgeMemberships).toHaveLength(0);
    const revokedAudit = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.eventId, event.id), eq(schema.auditEvents.action, "judge_application.revoke")));
    expect(revokedAudit).toHaveLength(1);
  });

  it("supports rubric creation, criterion creation, and single-active-rubric lifecycle", async () => {
    const organizer = await user("rubric-organizer");
    const participant = await user("rubric-participant");
    const event = await createEvent(organizer.actor, {
      slug: `rubric-api-${Date.now()}`,
      name: "Rubric API",
      timezone: "UTC",
    });
    const path = `/api/v1/events/${event.id}/rubrics`;
    const params = { eventId: event.id };

    const deniedList = await invoke(rubricsRoute.GET, request("GET", path, participant.cookie), params);
    expect(deniedList.response.status).toBe(403);
    const created = await invoke(rubricsRoute.POST, request("POST", path, organizer.cookie, { name: "First rubric" }), params);
    console.log("rubric-create", created.response.status, created.body);
    expect(created.body).not.toHaveProperty("error", expect.objectContaining({ code: "INTERNAL" }));
    expect(created.response.status).toBe(201);
    const rubricId = created.body.rubric.id as string;

    const invalidActivation = await invoke(activateRoute.POST, request("POST", `${path}/${rubricId}/activate`, organizer.cookie), { ...params, rubricId });
    expect(invalidActivation.response.status).toBe(409);

    const criterionBody = { name: "Originality", description: "Novelty and insight", weight: 100, minScore: 1, maxScore: 5, optional: false };
    const criterion = await invoke(criteriaRoute.POST, request("POST", `${path}/${rubricId}/criteria`, organizer.cookie, criterionBody), { ...params, rubricId });
    expect(criterion.response.status).toBe(201);
    const active = await invoke(activateRoute.POST, request("POST", `${path}/${rubricId}/activate`, organizer.cookie), { ...params, rubricId });
    expect(active.body.rubric.active).toBe(true);

    const second = await invoke(rubricsRoute.POST, request("POST", path, organizer.cookie, { name: "Second rubric" }), params);
    const secondId = second.body.rubric.id as string;
    const secondCriterion = await invoke(criteriaRoute.POST, request("POST", `${path}/${secondId}/criteria`, organizer.cookie, { ...criterionBody, name: "Quality" }), { ...params, rubricId: secondId });
    expect(secondCriterion.response.status).toBe(201);
    const secondActive = await invoke(activateRoute.POST, request("POST", `${path}/${secondId}/activate`, organizer.cookie), { ...params, rubricId: secondId });
    expect(secondActive.body.rubric.active).toBe(true);

    const listed = await invoke(rubricsRoute.GET, request("GET", path, organizer.cookie), params);
    expect(listed.body.rubrics.filter((rubric: { active: boolean }) => rubric.active)).toHaveLength(1);
    expect(listed.body.rubrics.find((rubric: { id: string }) => rubric.id === rubricId).active).toBe(false);

    const wrongEventCriterion = await invoke(criteriaRoute.POST, request("POST", `/api/v1/events/${event.id}/rubrics/${rubricId}/criteria`, participant.cookie, criterionBody), { eventId: "00000000-0000-4000-8000-000000000001", rubricId });
    expect(wrongEventCriterion.response.status).toBe(404);
  });
});
