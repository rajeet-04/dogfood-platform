import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { createEvent, grantEventMembership } from "@dogfood/events";
import {
  createTeam,
  createTeamInvite,
  getTeam,
  joinTeam,
  leaveTeam,
} from "@dogfood/teams";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

async function eventWithParticipants(count: number) {
  const organizer = await registerUser({
    email: "org@example.com",
    password: "pass",
    displayName: "Org",
  });
  const event = await createEvent(actorFor(organizer.id), {
    slug: "teams-event",
    name: "Teams Event",
    timezone: "UTC",
  });

  const users: Actor[] = [];
  for (let i = 0; i < count; i++) {
    const user = await registerUser({
      email: `participant-${i}@example.com`,
      password: "pass",
      displayName: `Participant ${i}`,
    });
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      user.id,
      "PARTICIPANT",
    );
    users.push(actorFor(user.id));
  }
  return { event, organizer: actorFor(organizer.id), users };
}

describe("teams", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lets a participant create a team and become its owner", async () => {
    const { event, users } = await eventWithParticipants(1);
    const team = await createTeam(users[0], event.id, {
      name: "Alpha",
    });

    expect(team.eventId).toBe(event.id);
    expect(team.name).toBe("Alpha");
    expect(team.isOwner).toBe(true);
  });

  it("rejects duplicate team creation by the same participant", async () => {
    const { event, users } = await eventWithParticipants(1);
    await createTeam(users[0], event.id, { name: "Alpha" });

    await expect(
      createTeam(users[0], event.id, { name: "Beta" }),
    ).rejects.toMatchObject({ code: "TEAM_RULE_VIOLATION" });
  });

  it("rejects a participant joining a second team in the same event", async () => {
    const { event, users } = await eventWithParticipants(2);
    const teamAlpha = await createTeam(users[0], event.id, { name: "Alpha" });
    await createTeam(users[1], event.id, { name: "Beta" });

    const invite = await createTeamInvite(users[0], teamAlpha.id, {});
    await expect(
      joinTeam(users[1], event.id, invite.rawToken),
    ).rejects.toMatchObject({ code: "TEAM_RULE_VIOLATION" });
  });

  it("rejects joining a team from another event", async () => {
    const { event, users } = await eventWithParticipants(2);
    const team = await createTeam(users[0], event.id, { name: "Alpha" });
    const invite = await createTeamInvite(users[0], team.id, {});

    const otherOrganizer = await registerUser({
      email: "other-org@example.com",
      password: "pass",
      displayName: "OtherOrg",
    });
    const otherEvent = await createEvent(actorFor(otherOrganizer.id), {
      slug: "other-event",
      name: "Other Event",
      timezone: "UTC",
    });

    await expect(
      joinTeam(users[1], otherEvent.id, invite.rawToken),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-participant from joining a team", async () => {
    const { event, organizer, users } = await eventWithParticipants(1);
    const judge = await registerUser({
      email: "judge@example.com",
      password: "pass",
      displayName: "Judge",
    });
    await grantEventMembership(organizer, event.id, judge.id, "JUDGE");

    const team = await createTeam(users[0], event.id, { name: "Alpha" });
    const invite = await createTeamInvite(users[0], team.id, {});

    await expect(
      joinTeam(actorFor(judge.id), event.id, invite.rawToken),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a participant to leave a team and rejoin another", async () => {
    const { event, users } = await eventWithParticipants(3);
    const teamA = await createTeam(users[0], event.id, { name: "Alpha" });
    const teamB = await createTeam(users[1], event.id, { name: "Beta" });

    const invite = await createTeamInvite(users[0], teamA.id, {});
    await joinTeam(users[2], event.id, invite.rawToken);
    await leaveTeam(users[2], teamA.id);
    await expect(
      getTeam(users[2], teamA.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const inviteB = await createTeamInvite(users[1], teamB.id, {});
    await joinTeam(users[2], event.id, inviteB.rawToken);
    const detail = await getTeam(users[2], teamB.id);
    expect(detail.id).toBe(teamB.id);
  });

  it("prevents a non-member of the event from creating a team", async () => {
    const { event } = await eventWithParticipants(0);
    const outsider = await registerUser({
      email: "outsider@example.com",
      password: "pass",
      displayName: "Outsider",
    });

    await expect(
      createTeam(actorFor(outsider.id), event.id, { name: "Solo" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});