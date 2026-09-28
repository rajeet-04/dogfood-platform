import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership } from "@dogfood/events";
import { createTeam } from "@dogfood/teams";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as inviteRoute from "../../apps/web/app/api/v1/events/[eventId]/teams/[teamId]/invitations/route";
import * as teamRoute from "../../apps/web/app/api/v1/events/[eventId]/teams/[teamId]/route";
import * as joinRoute from "../../apps/web/app/api/v1/events/[eventId]/teams/join/route";
import * as leaveRoute from "../../apps/web/app/api/v1/events/[eventId]/teams/[teamId]/leave/route";

const base = "http://dogfood.local";
let userCounter = 0;

async function user(label: string) {
  userCounter += 1;
  const account = await registerUser({
    email: `${label}-${Date.now()}-${userCounter}@teams-api.test`,
    password: "password123",
    displayName: label,
  });
  const session = await createSession(account.id);
  return {
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

describe("team membership REST API", () => {
  beforeEach(async () => {
    userCounter = 0;
    await resetDb();
  });

  it("creates a team invite, accepts it, reads membership, and leaves with audit records", async () => {
    const organizer = await user("organizer");
    const owner = await user("owner");
    const member = await user("member");
    const outsider = await user("outsider");
    const event = await createEvent(organizer.actor, {
      slug: `team-api-${Date.now()}`,
      name: "Team API",
      timezone: "UTC",
    });
    for (const participant of [owner, member, outsider]) {
      await grantEventMembership(organizer.actor, event.id, participant.actor.userId, "PARTICIPANT");
    }
    const team = await createTeam(owner.actor, event.id, { name: "API team" });
    const teamPath = `/api/v1/events/${event.id}/teams/${team.id}`;
    const params = { eventId: event.id, teamId: team.id };

    const ownerOnly = await invoke(inviteRoute.POST, request("POST", `${teamPath}/invitations`, member.cookie), params);
    expect(ownerOnly.response.status).toBe(403);

    const invitation = await invoke(inviteRoute.POST, request("POST", `${teamPath}/invitations`, owner.cookie), params);
    expect(invitation.response.status).toBe(201);
    expect(invitation.body.inviteCode).toMatch(/^[A-Za-z0-9]{4,16}$/);

    const joined = await invoke(joinRoute.POST, request("POST", `/api/v1/events/${event.id}/teams/join`, member.cookie, {
      inviteCode: invitation.body.inviteCode,
    }), { eventId: event.id });
    expect(joined.response.status).toBe(200);
    expect(joined.body.team).toMatchObject({ id: team.id, isOwner: false, memberCount: 2 });

    const detail = await invoke(teamRoute.GET, request("GET", teamPath, member.cookie), params);
    expect(detail.response.status).toBe(200);
    expect(detail.body.team.members.map((row: { userId: string }) => row.userId)).toEqual(expect.arrayContaining([
      owner.actor.userId,
      member.actor.userId,
    ]));

    const deniedLeave = await invoke(leaveRoute.POST, request("POST", `${teamPath}/leave`, outsider.cookie), params);
    expect(deniedLeave.response.status).toBe(403);
    const left = await invoke(leaveRoute.POST, request("POST", `${teamPath}/leave`, member.cookie), params);
    expect(left.response.status).toBe(200);
    expect(left.body.accepted).toBe(true);

    const noLongerMember = await invoke(teamRoute.GET, request("GET", teamPath, member.cookie), params);
    expect(noLongerMember.response.status).toBe(403);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining([
      "team.invite.create", "team.join", "team.leave",
    ]));
  });

  it("does not expose a team through the wrong event path or accept malformed invite codes", async () => {
    const organizer = await user("organizer");
    const owner = await user("owner");
    const event = await createEvent(organizer.actor, {
      slug: `team-scope-${Date.now()}`,
      name: "Team scope API",
      timezone: "UTC",
    });
    await grantEventMembership(organizer.actor, event.id, owner.actor.userId, "PARTICIPANT");
    const team = await createTeam(owner.actor, event.id, { name: "Scoped team" });
    const wrongEventId = "00000000-0000-4000-8000-000000000001";
    const wrongEventRead = await invoke(teamRoute.GET, request("GET", `/api/v1/events/${wrongEventId}/teams/${team.id}`, owner.cookie), {
      eventId: wrongEventId,
      teamId: team.id,
    });
    expect(wrongEventRead.response.status).toBe(404);

    const malformed = await invoke(joinRoute.POST, request("POST", `/api/v1/events/${event.id}/teams/join`, owner.cookie, { inviteCode: "??" }), {
      eventId: event.id,
    });
    expect(malformed.response.status).toBe(422);
  });
});
