import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { and, db, eq, schema } from "@dogfood/db";
import { createEvent, transitionEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as joinRoute from "../../apps/web/app/api/v1/events/[eventId]/join/route";
import * as membersRoute from "../../apps/web/app/api/v1/events/[eventId]/members/route";
import * as memberRoute from "../../apps/web/app/api/v1/events/[eventId]/members/[userId]/route";

const base = "http://dogfood.local";
let userCounter = 0;

async function user(label: string) {
  userCounter += 1;
  const account = await registerUser({
    email: `${label}-${Date.now()}-${userCounter}@members-api.test`,
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
  return new Request(`${base}${path}`, {
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
  const response = await handler(req, { params: Promise.resolve(params) });
  return { response, body: await response.json() as Record<string, any> };
}

describe("event membership REST API", () => {
  beforeEach(async () => {
    userCounter = 0;
    await resetDb();
  });

  it("joins participants and lets organizers add, change, and remove members", async () => {
    const organizer = await user("organizer");
    const participant = await user("participant");
    const judge = await user("judge");
    const event = await createEvent(organizer.actor, {
      slug: `members-api-${Date.now()}`,
      name: "Membership API",
      timezone: "UTC",
    });
    await transitionEvent(organizer.actor, event.id, "REGISTRATION");
    const eventPath = `/api/v1/events/${event.id}`;
    const eventParams = { eventId: event.id };

    const unauthenticated = await invoke(
      joinRoute.POST,
      request("POST", `${eventPath}/join`),
      eventParams,
    );
    expect(unauthenticated.response.status).toBe(401);

    const joined = await invoke(
      joinRoute.POST,
      request("POST", `${eventPath}/join`, participant.cookie),
      eventParams,
    );
    expect(joined.response.status).toBe(200);
    expect(joined.body.membership).toMatchObject({ userId: participant.id, role: "PARTICIPANT" });

    const repeatedJoin = await invoke(
      joinRoute.POST,
      request("POST", `${eventPath}/join`, participant.cookie),
      eventParams,
    );
    expect(repeatedJoin.response.status).toBe(200);
    expect(repeatedJoin.body.membership.id).toBe(joined.body.membership.id);

    const deniedAdd = await invoke(
      membersRoute.POST,
      request("POST", `${eventPath}/members`, participant.cookie, { email: judge.email, role: "JUDGE" }),
      eventParams,
    );
    expect(deniedAdd.response.status).toBe(403);

    const malformedAdd = await invoke(
      membersRoute.POST,
      request("POST", `${eventPath}/members`, organizer.cookie, { email: "bad", role: "PARTICIPANT" }),
      eventParams,
    );
    expect(malformedAdd.response.status).toBe(422);

    const added = await invoke(
      membersRoute.POST,
      request("POST", `${eventPath}/members`, organizer.cookie, { email: ` ${judge.email} `, role: "JUDGE" }),
      eventParams,
    );
    expect(added.response.status).toBe(201);
    expect(added.body.membership).toMatchObject({ userId: judge.id, role: "JUDGE" });

    const changed = await invoke(
      memberRoute.PATCH,
      request("PATCH", `${eventPath}/members/${judge.id}`, organizer.cookie, { role: "PARTICIPANT" }),
      { ...eventParams, userId: judge.id },
    );
    expect(changed.response.status).toBe(200);
    expect(changed.body.membership).toMatchObject({ userId: judge.id, role: "PARTICIPANT" });

    const removed = await invoke(
      memberRoute.DELETE,
      request("DELETE", `${eventPath}/members/${judge.id}`, organizer.cookie),
      { ...eventParams, userId: judge.id },
    );
    expect(removed.response.status).toBe(200);
    expect(removed.body).toEqual({ removed: true });

    const deniedRemove = await invoke(
      memberRoute.DELETE,
      request("DELETE", `${eventPath}/members/${participant.id}`, participant.cookie),
      { ...eventParams, userId: participant.id },
    );
    expect(deniedRemove.response.status).toBe(403);

    const memberships = await db
      .select()
      .from(schema.eventMemberships)
      .where(eq(schema.eventMemberships.eventId, event.id));
    expect(memberships.map((row) => [row.userId, row.role])).toEqual(expect.arrayContaining([
      [organizer.id, "ORGANIZER"],
      [participant.id, "PARTICIPANT"],
    ]));

    const audit = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining([
      "event.join",
      "event.member.grant",
      "event.member.remove",
    ]));

    const notifications = await db
      .select({ type: schema.notifications.type })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, judge.id),
        eq(schema.notifications.eventId, event.id),
      ));
    expect(notifications.map((row) => row.type)).toEqual(expect.arrayContaining([
      "judge_added",
      "role_changed",
      "role_changed",
    ]));
  });
});
