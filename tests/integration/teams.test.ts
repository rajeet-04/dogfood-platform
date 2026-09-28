import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import {
  createTeam,
  createTeamInvite,
  getTeam,
  joinTeam,
  leaveTeam,
} from "@dogfood/teams";
import { createProject, submitProject } from "@dogfood/submissions";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import { getParticipantHome } from "../../apps/web/server/read-models/participant";

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

  it("issues a short human-typeable invite code", async () => {
    const { event, users } = await eventWithParticipants(1);
    const team = await createTeam(users[0], event.id, { name: "Alpha" });

    const invite = await createTeamInvite(users[0], team.id, {});
    expect(invite.rawToken.length).toBeLessThanOrEqual(16);
    expect(invite.rawToken).toMatch(/^[A-Za-z0-9]+$/);

    const detail = await getTeam(users[0], team.id);
    expect(detail.id).toBe(team.id);
  });

  it("keeps the first member as leader and marks later joiners as non-owners", async () => {
    const { event, users } = await eventWithParticipants(2);
    const team = await createTeam(users[0], event.id, { name: "Alpha" });
    const invite = await createTeamInvite(users[0], team.id, {});
    const joined = await joinTeam(users[1], event.id, invite.rawToken);

    expect(users[0].userId).not.toBe(users[1].userId);
    expect(team.isOwner).toBe(true);
    expect(joined.isOwner).toBe(false);
    expect(joined.ownerIds).toContain(users[0].userId);
    expect(joined.ownerIds).not.toContain(users[1].userId);
  });

  it("shows the team project to every member after one member submits", async () => {
    const { event, organizer, users } = await eventWithParticipants(2);
    // Rosters lock when submissions open, so the team forms during registration.
    const team = await createTeam(users[0], event.id, { name: "Alpha" });
    const invite = await createTeamInvite(users[0], team.id, {});
    await transitionEvent(organizer, event.id, "REGISTRATION");
    await joinTeam(users[1], event.id, invite.rawToken);
    await transitionEvent(organizer, event.id, "SUBMISSIONS_OPEN");

    const project = await createProject(users[0], event.id, {
      teamId: team.id,
      title: "Shared Project",
      description: "Submitted by the team leader.",
      repositoryUrl: "https://example.com/repo",
    });
    const submitted = await submitProject(users[0], event.id, project.id);
    expect(submitted.state).toBe("SUBMITTED");

    for (const member of users) {
      const home = await getParticipantHome(member, event.id);
      expect(home.team?.id).toBe(team.id);
      expect(home.project?.id).toBe(project.id);
      expect(home.project?.state).toBe("SUBMITTED");
      expect(home.project?.currentRevision.title).toBe("Shared Project");
      expect(home.revisions.length).toBeGreaterThan(0);
    }
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

  it("locks the roster once submissions open", async () => {
    const { event, organizer, users } = await eventWithParticipants(3);
    const teamA = await createTeam(users[0], event.id, { name: "Alpha" });
    const teamB = await createTeam(users[1], event.id, { name: "Beta" });
    const inviteA = await createTeamInvite(users[0], teamA.id, {});
    const inviteB = await createTeamInvite(users[1], teamB.id, {});
    await joinTeam(users[2], event.id, inviteA.rawToken);

    await transitionEvent(organizer, event.id, "REGISTRATION");
    await transitionEvent(organizer, event.id, "SUBMISSIONS_OPEN");

    // No new teams, no switching, and no leaving once the window is open.
    await expect(
      createTeam(users[2], event.id, { name: "Gamma" }),
    ).rejects.toMatchObject({ code: "TEAM_RULE_VIOLATION" });
    await expect(
      leaveTeam(users[2], teamA.id),
    ).rejects.toMatchObject({ code: "TEAM_RULE_VIOLATION" });
    await expect(
      joinTeam(users[2], event.id, inviteB.rawToken),
    ).rejects.toMatchObject({ code: "TEAM_RULE_VIOLATION" });

    // The existing roster is untouched.
    const detail = await getTeam(users[2], teamA.id);
    expect(detail.id).toBe(teamA.id);
  });

  it("keeps the roster locked through judging and publication", async () => {
    const { event, organizer, users } = await eventWithParticipants(2);
    await createTeam(users[0], event.id, { name: "Alpha" });

    await transitionEvent(organizer, event.id, "REGISTRATION");
    await transitionEvent(organizer, event.id, "SUBMISSIONS_OPEN");
    await transitionEvent(organizer, event.id, "SUBMISSIONS_CLOSED");
    await transitionEvent(organizer, event.id, "JUDGING");
    await transitionEvent(organizer, event.id, "RESULTS_READY");

    await expect(
      createTeam(users[1], event.id, { name: "Late" }),
    ).rejects.toMatchObject({ code: "TEAM_RULE_VIOLATION" });
  });
});