import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { queryAudit } from "@dogfood/audit";
import { and, db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import { createTeam } from "@dogfood/teams";
import { createProject, submitProject } from "@dogfood/submissions";
import { castVote, createProjectComment, deleteProjectComment, getVotingBallot, getVotingResults, updateVotingConfig } from "@dogfood/voting";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as votingAuditRoute from "../../apps/web/app/api/v1/events/[eventId]/voting/audit/route";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

async function votingAuditResponse(actor: Actor, eventId: string): Promise<string> {
  const session = await createSession(actor.userId);
  const response = await votingAuditRoute.GET(
    new Request(`http://dogfood.local/api/v1/events/${eventId}/voting/audit`, {
      headers: { cookie: `dogfood_session=${session.rawToken}` },
    }),
    { params: Promise.resolve({ eventId }) },
  );
  expect(response.status).toBe(200);
  return response.text();
}

async function votingEvent() {
  const organizerUser = await registerUser({ email: "vote-org@example.com", password: "pass", displayName: "Vote organizer" });
  const participantUser = await registerUser({ email: "vote-owner@example.com", password: "pass", displayName: "Project owner" });
  const voterUser = await registerUser({ email: "voter@example.com", password: "pass", displayName: "Voter" });
  const organizer = actorFor(organizerUser.id);
  const participant = actorFor(participantUser.id);
  const voter = actorFor(voterUser.id);
  const event = await createEvent(organizer, {
    slug: "community-voting",
    name: "Community voting",
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60_000),
  });
  await transitionEvent(organizer, event.id, "REGISTRATION");
  await grantEventMembership(organizer, event.id, participant.userId, "PARTICIPANT");
  const team = await createTeam(participant, event.id, { name: "Vote team" });
  await transitionEvent(organizer, event.id, "SUBMISSIONS_OPEN");
  const project = await createProject(participant, event.id, {
    teamId: team.id,
    title: "Community project",
    description: "A complete project",
  });
  await submitProject(participant, event.id, project.id);
  await transitionEvent(organizer, event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(organizer, event.id, "JUDGING");
  const opensAt = new Date(Date.now() - 60_000);
  const closesAt = new Date(Date.now() + 60 * 60_000);
  await updateVotingConfig(organizer, event.id, { opensAt, closesAt });
  return { event, organizer, participant, voter, project };
}

describe("authenticated public voting", () => {
  beforeEach(async () => resetDb());

  it("returns a randomized ballot containing only visible projects", async () => {
    const { event } = await votingEvent();
    const ballot = await getVotingBallot(actorFor((await registerUser({ email: "ballot@example.com", password: "pass", displayName: "Ballot" })).id), event.id);
    expect(ballot.projects).toHaveLength(1);
    expect(ballot.projects[0].title).toBe("Community project");
  });

  it("rejects votes when an organizer disables the voting window", async () => {
    const { event, organizer, voter, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { opensAt: null, closesAt: null });
    await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks a project team member without consuming a vote rate bucket", async () => {
    const { event, organizer, participant, project } = await votingEvent();
    await expect(castVote(participant, event.id, project.id)).rejects.toMatchObject({ code: "FORBIDDEN", message: "This vote is not allowed" });
    const buckets = await db.select().from(schema.votingRateLimits).where(eq(schema.votingRateLimits.eventId, event.id));
    expect(buckets).toHaveLength(0);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toContain("vote.self_attempt");
    expect(await votingAuditResponse(organizer, event.id)).not.toContain(project.id);
  });

  it("denies voting audit access to a deactivated organizer", async () => {
    const { event, organizer } = await votingEvent();
    await db.update(schema.eventMemberships)
      .set({ isActive: false })
      .where(and(
        eq(schema.eventMemberships.eventId, event.id),
        eq(schema.eventMemberships.userId, organizer.userId),
      ));

    const session = await createSession(organizer.userId);
    const response = await votingAuditRoute.GET(
      new Request(`http://dogfood.local/api/v1/events/${event.id}/voting/audit`, {
        headers: { cookie: `dogfood_session=${session.rawToken}` },
      }),
      { params: Promise.resolve({ eventId: event.id }) },
    );
    expect(response.status).toBe(403);
  });

  it("accepts one vote per authenticated account and audits a duplicate attempt", async () => {
    const { event, organizer, voter, project } = await votingEvent();
    await castVote(voter, event.id, project.id);
    await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "CONFLICT" });
    const votes = await db.select().from(schema.votes).where(eq(schema.votes.eventId, event.id));
    expect(votes).toHaveLength(1);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toContain("vote.duplicate");
    for (const row of audit.filter((row) => row.resourceType === "vote")) {
      expect(row.actorId).toBeNull();
      expect(row.resourceId).toBeNull();
      expect(row.metadata).toBeNull();
    }
    expect(await votingAuditResponse(organizer, event.id)).not.toContain(project.id);
  });

  it("rate limits repeated write attempts and records the blocked action", async () => {
    const { event, voter, project } = await votingEvent();
    await castVote(voter, event.id, project.id);
    for (let attempt = 0; attempt < 9; attempt++) {
      await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toContain("vote.rate_limited");
    const rateBucket = await db.select().from(schema.votingRateLimits).where(eq(schema.votingRateLimits.eventId, event.id));
    expect(rateBucket).toHaveLength(1);
    expect(rateBucket[0].count).toBe(11);
  });

  it("keeps active results available only to event organizers", async () => {
    const { event, voter, organizer } = await votingEvent();
    await expect(getVotingResults(voter, event.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getVotingResults(organizer, event.id)).resolves.toMatchObject({ results: [] });
  });

  it("does not expose a seeded tally to voters before the configured window opens", async () => {
    const { event, organizer, voter, project } = await votingEvent();
    await castVote(voter, event.id, project.id);
    await updateVotingConfig(organizer, event.id, {
      opensAt: new Date(Date.now() + 10 * 60_000),
      closesAt: new Date(Date.now() + 60 * 60_000),
    });
    await expect(getVotingResults(voter, event.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps results private in results-ready state until the configured close time passes", async () => {
    const { event, organizer, voter, project } = await votingEvent();
    await castVote(voter, event.id, project.id);
    await updateVotingConfig(organizer, event.id, {
      opensAt: new Date(Date.now() - 60_000),
      closesAt: new Date(Date.now() + 60 * 60_000),
    });
    await transitionEvent(organizer, event.id, "RESULTS_READY");
    await expect(getVotingResults(voter, event.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getVotingResults(organizer, event.id)).resolves.toMatchObject({ results: [{ projectId: project.id, votes: 1 }] });
    await updateVotingConfig(organizer, event.id, {
      opensAt: new Date(Date.now() - 10 * 60_000),
      closesAt: new Date(Date.now() - 60_000),
    });
    await expect(getVotingResults(voter, event.id)).resolves.toMatchObject({ results: [{ projectId: project.id, votes: 1 }] });
  });

  it("allows an authenticated commenter to remove their own comment", async () => {
    const { event, voter, project } = await votingEvent();
    const comment = await createProjectComment(voter, event.id, project.id, "Useful project!");
    expect(comment.body).toBe("Useful project!");
    await deleteProjectComment(voter, event.id, project.id, comment.id);
    const stored = await db.select().from(schema.projectComments).where(eq(schema.projectComments.id, comment.id));
    expect(stored).toHaveLength(0);
  });

  it("rate limits comment writes independently from vote writes", async () => {
    const { event, organizer, voter, project } = await votingEvent();
    for (let attempt = 0; attempt < 10; attempt++) {
      await createProjectComment(voter, event.id, project.id, `Comment ${attempt}`);
    }
    await expect(createProjectComment(voter, event.id, project.id, "One more")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toContain("comment.rate_limited");
    const commentAudit = await queryAudit(organizer, event.id, { resourceType: "comment" });
    expect(commentAudit.map((row) => row.action)).toContain("comment.rate_limited");
    const responseBody = JSON.parse(await votingAuditResponse(organizer, event.id)) as { events: { action: string; resourceType: string }[] };
    expect(responseBody.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "comment.rate_limited", resourceType: "comment" }),
    ]));
  });
});
