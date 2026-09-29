import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";

import { createSession, registerUser } from "@dogfood/auth";
import { createWebhookEndpoint, queryAudit } from "@dogfood/audit";
import { and, db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import { createTeam } from "@dogfood/teams";
import { createProject, submitProject } from "@dogfood/submissions";
import { castVote, createProjectComment, createVotingInvitation, deleteProjectComment, ensureOpenLinkCredential, getVotingBallot, getVotingConfig, getVotingResults, listVotingInvitations, revokeVotingInvitation, trustedVotingNetworkHash, updateVotingConfig } from "@dogfood/voting";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as votingAuditRoute from "../../apps/web/app/api/v1/events/[eventId]/voting/audit/route";
import * as votesRoute from "../../apps/web/app/api/v1/events/[eventId]/votes/route";

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
  afterEach(() => vi.unstubAllEnvs());

  it("returns a randomized ballot containing only visible projects", async () => {
    const { event } = await votingEvent();
    const ballot = await getVotingBallot(actorFor((await registerUser({ email: "ballot@example.com", password: "pass", displayName: "Ballot" })).id), event.id);
    expect(ballot.projects).toHaveLength(1);
    expect(ballot.projects[0].title).toBe("Community project");
  });

  it("defaults to authenticated-account access", async () => {
    const { event } = await votingEvent();
    expect(await getVotingConfig(event.id)).toMatchObject({ accessMode: "AUTHENTICATED" });
  });

  it("uses x-real-ip only when trusted proxy headers and a hash secret are configured", () => {
    expect(trustedVotingNetworkHash("198.51.100.2")).toBeUndefined();
    vi.stubEnv("DOGFOOD_TRUST_PROXY_HEADERS", "true");
    expect(trustedVotingNetworkHash("198.51.100.2")).toBeUndefined();
    vi.stubEnv("DOGFOOD_VOTING_ABUSE_SECRET", "test-only-key");
    const first = trustedVotingNetworkHash("198.51.100.2");
    expect(first).toBe(trustedVotingNetworkHash("198.51.100.250"));
    expect(first).not.toBe(trustedVotingNetworkHash("198.51.101.2"));
    expect(first).not.toMatch(/198\.51\.100/);
    expect(trustedVotingNetworkHash("2001:db8:1234:5678::1"))
      .toBe(trustedVotingNetworkHash("2001:db8:1234:5678:abcd::ffff"));
    expect(trustedVotingNetworkHash("not-an-ip")).toBeUndefined();
  });

  it("mints open-link tokens server-side and hashes the browser token on one vote", async () => {
    const { event, organizer, participant, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    const issued = await ensureOpenLinkCredential(event.id);
    const issuedAgain = await ensureOpenLinkCredential(event.id, issued.token);
    expect(issuedAgain.token).toBe(issued.token);
    const credentials = await db.select().from(schema.votingCredentials).where(eq(schema.votingCredentials.eventId, event.id));
    expect(credentials).toHaveLength(1);
    expect(credentials[0]).toMatchObject({ accessMode: "OPEN_LINK", email: null, createdBy: null });
    expect(credentials[0].tokenHash).not.toBe(issued.token);
    const ballot = await getVotingBallot(null, event.id, issued.token);
    expect(ballot.accessMode).toBe("OPEN_LINK");
    expect(ballot.hasVoted).toBe(false);
    await expect(castVote(participant, event.id, project.id, issued.token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await castVote(null, event.id, project.id, issued.token);
    await expect(castVote(null, event.id, project.id, issued.token)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getVotingBallot(null, event.id, issued.token)).toMatchObject({ hasVoted: true });
    const votesWithToken = await db.select().from(schema.votes).where(eq(schema.votes.eventId, event.id));
    expect(votesWithToken[0].voterTokenHash).not.toBe(issued.token);
    expect(votesWithToken[0].voterTokenHash).toMatch(/^[a-f0-9]{64}$/);
    const buckets = await db.select().from(schema.votingCredentialRateLimits).where(eq(schema.votingCredentialRateLimits.eventId, event.id));
    expect(buckets).toHaveLength(1);
    expect(buckets[0].credentialId).toBeNull();
    expect(buckets[0].voterTokenHash).toBe(votesWithToken[0].voterTokenHash);
  });

  it("limits fresh open-link tokens by trusted network and event-wide hourly buckets", async () => {
    vi.stubEnv("DOGFOOD_TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("DOGFOOD_VOTING_ABUSE_SECRET", "test-only-key");
    vi.stubEnv("DOGFOOD_VOTING_NETWORK_LIMIT_PER_HOUR", "2");
    vi.stubEnv("DOGFOOD_VOTING_EVENT_LIMIT_PER_HOUR", "20");
    const { event, organizer, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });

    const key = "198.51.100.0/24";
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const credential = await ensureOpenLinkCredential(event.id);
      await castVote(null, event.id, project.id, credential.token, { networkHash: key });
    }
    const freshToken = await ensureOpenLinkCredential(event.id);
    await expect(castVote(null, event.id, project.id, freshToken.token, { networkHash: key }))
      .rejects.toMatchObject({ code: "RATE_LIMITED" });

    const rows = await db.select().from(schema.votingAbuseRateLimits).where(eq(schema.votingAbuseRateLimits.eventId, event.id));
    expect(rows.find((row) => row.action === "vote" && row.scope === "NETWORK")?.count).toBe(3);
    // The event bucket counts valid vote attempts, including attempts blocked by a network cap.
    expect(rows.find((row) => row.action === "vote" && row.scope === "EVENT")?.count).toBe(3);
  });

  it("caps total event votes even when requests use different trusted networks", async () => {
    vi.stubEnv("DOGFOOD_TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("DOGFOOD_VOTING_ABUSE_SECRET", "test-only-key");
    vi.stubEnv("DOGFOOD_VOTING_NETWORK_LIMIT_PER_HOUR", "20");
    vi.stubEnv("DOGFOOD_VOTING_EVENT_LIMIT_PER_HOUR", "2");
    const { event, organizer, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const credential = await ensureOpenLinkCredential(event.id);
      await castVote(null, event.id, project.id, credential.token, { networkHash: `network-${attempt}` });
    }
    const credential = await ensureOpenLinkCredential(event.id);
    await expect(castVote(null, event.id, project.id, credential.token, { networkHash: "network-new" }))
      .rejects.toMatchObject({ code: "RATE_LIMITED" });
    const rows = await db.select().from(schema.votingAbuseRateLimits).where(eq(schema.votingAbuseRateLimits.eventId, event.id));
    expect(rows.find((row) => row.action === "vote" && row.scope === "EVENT")?.count).toBe(3);
  });

  it("rejects well-formed open-link tokens the server never minted", async () => {
    const { event, organizer, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    const forged = randomBytes(32).toString("base64url");
    await expect(getVotingBallot(null, event.id, forged)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(castVote(null, event.id, project.id, forged)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    // A forged cookie is replaced with a fresh server-minted token rather than adopted.
    const reissued = await ensureOpenLinkCredential(event.id, forged);
    expect(reissued.token).not.toBe(forged);
    await castVote(null, event.id, project.id, reissued.token);
    expect(await db.select().from(schema.votes).where(eq(schema.votes.eventId, event.id))).toHaveLength(1);
  });

  it("caps open-link identity minting per trusted network and audits the first refusal", async () => {
    vi.stubEnv("DOGFOOD_VOTING_LINK_NETWORK_LIMIT_PER_HOUR", "2");
    const { event, organizer } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    const first = await ensureOpenLinkCredential(event.id, undefined, { networkHash: "network-a" });
    await ensureOpenLinkCredential(event.id, undefined, { networkHash: "network-a" });
    await expect(ensureOpenLinkCredential(event.id, undefined, { networkHash: "network-a" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(ensureOpenLinkCredential(event.id, undefined, { networkHash: "network-a" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    // Returning browsers keep their identity, and other networks are unaffected.
    expect((await ensureOpenLinkCredential(event.id, first.token, { networkHash: "network-a" })).token).toBe(first.token);
    await ensureOpenLinkCredential(event.id, undefined, { networkHash: "network-b" });
    expect(await db.select().from(schema.votingCredentials).where(eq(schema.votingCredentials.eventId, event.id))).toHaveLength(3);
    const audits = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.eventId, event.id), eq(schema.auditEvents.action, "vote.link.network_rate_limited")));
    expect(audits).toHaveLength(1);
  });

  it("passes the configured reverse-proxy IP into the network voter throttle", async () => {
    vi.stubEnv("DOGFOOD_TRUST_PROXY_HEADERS", "true");
    vi.stubEnv("DOGFOOD_VOTING_ABUSE_SECRET", "test-only-key");
    vi.stubEnv("DOGFOOD_VOTING_NETWORK_LIMIT_PER_HOUR", "1");
    vi.stubEnv("DOGFOOD_VOTING_EVENT_LIMIT_PER_HOUR", "20");
    const { event, organizer, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    const post = async () => {
      const credential = await ensureOpenLinkCredential(event.id);
      return votesRoute.POST(new Request(`http://dogfood.local/api/v1/events/${event.id}/votes`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `dogfood_vote_${event.id}=${credential.token}`,
          "x-real-ip": "203.0.113.29",
        },
        body: JSON.stringify({ projectId: project.id }),
      }), { params: Promise.resolve({ eventId: event.id }) });
    };
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(429);
  });

  it("does not mint an open-link token before the voting window opens", async () => {
    const { event, organizer } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "OPEN_LINK", opensAt: new Date(Date.now() + 60 * 60_000), closesAt: new Date(Date.now() + 2 * 60 * 60_000) });
    await expect(ensureOpenLinkCredential(event.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(schema.votingCredentials).where(eq(schema.votingCredentials.eventId, event.id))).toHaveLength(0);
    expect(await db.select().from(schema.votingCredentialRateLimits).where(eq(schema.votingCredentialRateLimits.eventId, event.id))).toHaveLength(0);
  });

  it("issues email-labeled bearer invitations, consumes one vote, and rejects revoked codes", async () => {
    const { event, organizer, participant, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "EMAIL_GATED", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    const first = await createVotingInvitation(organizer, event.id, " Voter@Example.com ");
    expect(first.invitation.email).toBe("voter@example.com");
    expect(await getVotingBallot(null, event.id, first.token)).toMatchObject({ accessMode: "EMAIL_GATED", hasVoted: false });
    const rotated = await createVotingInvitation(organizer, event.id, "voter@example.com");
    await expect(getVotingBallot(null, event.id, first.token)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await getVotingBallot(null, event.id, rotated.token)).toMatchObject({ hasVoted: false });
    await expect(castVote(participant, event.id, project.id, rotated.token)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await castVote(null, event.id, project.id, rotated.token);
    await expect(castVote(null, event.id, project.id, rotated.token)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(createVotingInvitation(organizer, event.id, "voter@example.com")).rejects.toMatchObject({ code: "CONFLICT" });
    const second = await createVotingInvitation(organizer, event.id, "second@example.com");
    await revokeVotingInvitation(organizer, event.id, second.invitation.id);
    await expect(getVotingBallot(null, event.id, second.token)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const listed = await listVotingInvitations(organizer, event.id);
    expect(listed).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.invitation.id, voted: false, revokedAt: expect.any(Date) }),
      expect.objectContaining({ id: rotated.invitation.id, voted: true, revokedAt: null }),
      expect.objectContaining({ id: second.invitation.id, voted: false, revokedAt: expect.any(Date) }),
    ]));
  });

  it("rejects expired email invitations and blocks votes outside the configured window", async () => {
    const { event, organizer, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { accessMode: "EMAIL_GATED", opensAt: new Date(Date.now() - 60_000), closesAt: new Date(Date.now() + 60 * 60_000) });
    const invitation = await createVotingInvitation(organizer, event.id, "expired@example.com");
    await db.update(schema.votingCredentials).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.votingCredentials.id, invitation.invitation.id));
    await expect(getVotingBallot(null, event.id, invitation.token)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await updateVotingConfig(organizer, event.id, { accessMode: "EMAIL_GATED", opensAt: null, closesAt: null });
    await expect(castVote(null, event.id, project.id, invitation.token)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects votes when an organizer disables the voting window", async () => {
    const { event, organizer, voter, project } = await votingEvent();
    await updateVotingConfig(organizer, event.id, { opensAt: null, closesAt: null });
    await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("blocks a project team member without consuming a vote rate bucket", async () => {
    const { event, organizer, participant, project } = await votingEvent();
    const attempts = await Promise.all(Array.from({ length: 5 }, () =>
      castVote(participant, event.id, project.id).catch((error: unknown) => error),
    ));
    expect(attempts.every((error) => (error as { code?: string }).code === "FORBIDDEN")).toBe(true);
    const buckets = await db.select().from(schema.votingRateLimits).where(eq(schema.votingRateLimits.eventId, event.id));
    expect(buckets).toHaveLength(0);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.filter((row) => row.action === "vote.self_attempt")).toHaveLength(1);
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
    const { event, organizer, voter, project } = await votingEvent();
    await createWebhookEndpoint(organizer, event.id, {
      url: "https://hooks.example.test/voting-audit",
      eventTypes: ["vote.rate_limited"],
    });
    await castVote(voter, event.id, project.id);
    for (let attempt = 0; attempt < 9; attempt++) {
      await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "CONFLICT" });
    }
    await expect(castVote(voter, event.id, project.id)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const concurrentDenials = await Promise.all(Array.from({ length: 5 }, () =>
      castVote(voter, event.id, project.id).then(() => null, (error: unknown) => error)));
    expect(concurrentDenials).toHaveLength(5);
    expect(concurrentDenials.every((error) => (error as { code?: string }).code === "RATE_LIMITED")).toBe(true);
    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.filter((row) => row.action === "vote.rate_limited")).toHaveLength(1);
    const deliveries = await db.select().from(schema.webhookDeliveries);
    expect(deliveries).toHaveLength(1);
    const rateBucket = await db.select().from(schema.votingRateLimits).where(eq(schema.votingRateLimits.eventId, event.id));
    expect(rateBucket).toHaveLength(1);
    expect(rateBucket[0].count).toBe(16);
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
