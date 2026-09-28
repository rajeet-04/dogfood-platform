import { createHash, randomBytes, randomInt } from "node:crypto";

import { and, db, desc, eq, gt, inArray, schema, sql, sqlState, type DbTx, type EventRole } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

const WRITE_LIMIT_PER_MINUTE = 10;
type EventRow = typeof schema.events.$inferSelect;
type CommentRow = typeof schema.projectComments.$inferSelect;

export type VotingAccessMode = "AUTHENTICATED" | "OPEN_LINK" | "EMAIL_GATED";
export type VotingConfig = { eventId: string; accessMode: VotingAccessMode; opensAt: Date | null; closesAt: Date | null };
export type VotingResults = { results: { projectId: string; votes: number }[] };
const ACCESS_MODES: VotingAccessMode[] = ["AUTHENTICATED", "OPEN_LINK", "EMAIL_GATED"];
const CREDENTIAL_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

function configuredAccessMode(value: string | undefined): VotingAccessMode {
  return ACCESS_MODES.includes(value as VotingAccessMode) ? value as VotingAccessMode : "AUTHENTICATED";
}

async function eventForVoting(eventId: string): Promise<EventRow> {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  return event;
}

async function eventRoles(userId: string, eventId: string): Promise<EventRole[]> {
  const rows = await db.select({ role: schema.eventMemberships.role }).from(schema.eventMemberships)
    .where(and(eq(schema.eventMemberships.userId, userId), eq(schema.eventMemberships.eventId, eventId), eq(schema.eventMemberships.isActive, true)));
  return rows.map((row) => row.role);
}

async function requireOrganizer(actor: Actor, event: EventRow): Promise<void> {
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId: event.id, resourceEventId: event.id,
    roles: await eventRoles(actor.userId, event.id), eventState: event.state,
  });
}

export async function getVotingConfig(eventId: string): Promise<VotingConfig> {
  const event = await eventForVoting(eventId);
  const [config] = await db.select().from(schema.votingConfigs).where(eq(schema.votingConfigs.eventId, eventId)).limit(1);
  return {
    eventId, accessMode: configuredAccessMode(config?.accessMode),
    opensAt: config ? config.opensAt : event.judgingOpensAt,
    closesAt: config ? config.closesAt : event.judgingClosesAt,
  };
}

export type VotingInvitation = { id: string; email: string; createdAt: Date; expiresAt: Date; revokedAt: Date | null; voted: boolean };

async function findCredential(eventId: string, rawToken: string | undefined, accessMode: "OPEN_LINK" | "EMAIL_GATED") {
  if (!rawToken || rawToken.length > 256) return null;
  const [credential] = await db.select().from(schema.votingCredentials).where(and(
    eq(schema.votingCredentials.eventId, eventId),
    eq(schema.votingCredentials.accessMode, accessMode),
    eq(schema.votingCredentials.tokenHash, tokenHash(rawToken)),
    sql`${schema.votingCredentials.revokedAt} is null`,
    gt(schema.votingCredentials.expiresAt, new Date()),
  )).limit(1);
  return credential ?? null;
}

export async function ensureOpenLinkCredential(eventId: string, currentToken?: string): Promise<{ token: string; expiresAt: Date }> {
  await eventForVoting(eventId);
  const config = await getVotingConfig(eventId);
  if (config.accessMode !== "OPEN_LINK") throw new DogfoodError("CONFLICT", "Open-link voting is not enabled");
  if (!config.closesAt || config.closesAt <= new Date()) throw new DogfoodError("CONFLICT", "Community voting is not open");
  const existing = await findCredential(eventId, currentToken, "OPEN_LINK");
  if (existing) return { token: currentToken!, expiresAt: existing.expiresAt };
  const token = randomBytes(32).toString("base64url");
  const expiresAt = config.closesAt ?? new Date(Date.now() + CREDENTIAL_LIFETIME_MS);
  await db.insert(schema.votingCredentials).values({ eventId, accessMode: "OPEN_LINK", tokenHash: tokenHash(token), expiresAt });
  return { token, expiresAt };
}

export async function createVotingInvitation(actor: Actor, eventId: string, emailInput: string): Promise<{ invitation: VotingInvitation; token: string }> {
  const event = await eventForVoting(eventId);
  await requireOrganizer(actor, event);
  const config = await getVotingConfig(eventId);
  if (config.accessMode !== "EMAIL_GATED") throw new DogfoodError("CONFLICT", "Email-gated voting is not enabled");
  const email = emailInput.trim().toLowerCase();
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) throw new DogfoodError("VALIDATION_FAILED", "Enter a valid email address");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = config.closesAt ?? new Date(Date.now() + CREDENTIAL_LIFETIME_MS);
  const invitation = await db.transaction(async (tx) => {
    const previous = await tx.select({ id: schema.votingCredentials.id }).from(schema.votingCredentials).where(and(
      eq(schema.votingCredentials.eventId, eventId), eq(schema.votingCredentials.accessMode, "EMAIL_GATED"),
      eq(schema.votingCredentials.email, email),
    )).for("update");
    if (previous.length) {
      const previousIds = previous.map((row) => row.id);
      const [used] = await tx.select({ id: schema.votes.id }).from(schema.votes).where(and(
        eq(schema.votes.eventId, eventId), inArray(schema.votes.credentialId, previousIds),
      )).limit(1);
      if (used) throw new DogfoodError("CONFLICT", "This email address has already used its event voting invitation");
      await tx.update(schema.votingCredentials).set({ revokedAt: new Date() }).where(and(
        eq(schema.votingCredentials.eventId, eventId), eq(schema.votingCredentials.accessMode, "EMAIL_GATED"),
        eq(schema.votingCredentials.email, email), sql`${schema.votingCredentials.revokedAt} is null`,
      ));
    }
    const [credential] = await tx.insert(schema.votingCredentials).values({
      eventId, accessMode: "EMAIL_GATED", tokenHash: tokenHash(token), email, createdBy: actor.userId, expiresAt,
    }).returning();
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "voting_invitation.create", resourceType: "voting_invitation", resourceId: credential.id, metadata: { email, expiresAt: expiresAt.toISOString() } });
    return { id: credential.id, email, createdAt: credential.createdAt, expiresAt, revokedAt: credential.revokedAt, voted: false };
  });
  return { invitation, token };
}

export async function listVotingInvitations(actor: Actor, eventId: string): Promise<VotingInvitation[]> {
  const event = await eventForVoting(eventId);
  await requireOrganizer(actor, event);
  const rows = await db.select({
    id: schema.votingCredentials.id, email: schema.votingCredentials.email,
    createdAt: schema.votingCredentials.createdAt, expiresAt: schema.votingCredentials.expiresAt,
    revokedAt: schema.votingCredentials.revokedAt,
  }).from(schema.votingCredentials).where(and(
    eq(schema.votingCredentials.eventId, eventId), eq(schema.votingCredentials.accessMode, "EMAIL_GATED"),
  )).orderBy(desc(schema.votingCredentials.createdAt));
  const voteRows = await db.select({ credentialId: schema.votes.credentialId }).from(schema.votes)
    .where(eq(schema.votes.eventId, eventId));
  const voted = new Set(voteRows.map((row) => row.credentialId).filter((id): id is string => id !== null));
  return rows.filter((row): row is typeof row & { email: string } => row.email !== null)
    .map((row) => ({ ...row, voted: voted.has(row.id) }));
}

export async function revokeVotingInvitation(actor: Actor, eventId: string, invitationId: string): Promise<void> {
  const event = await eventForVoting(eventId);
  await requireOrganizer(actor, event);
  await db.transaction(async (tx) => {
    const [credential] = await tx.update(schema.votingCredentials).set({ revokedAt: new Date() }).where(and(
      eq(schema.votingCredentials.id, invitationId), eq(schema.votingCredentials.eventId, eventId),
      eq(schema.votingCredentials.accessMode, "EMAIL_GATED"), sql`${schema.votingCredentials.revokedAt} is null`,
    )).returning({ id: schema.votingCredentials.id, email: schema.votingCredentials.email });
    if (!credential) throw new DogfoodError("NOT_FOUND", "Voting invitation not found");
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "voting_invitation.revoke", resourceType: "voting_invitation", resourceId: credential.id, metadata: { email: credential.email } });
  });
}

export async function updateVotingConfig(actor: Actor, eventId: string, input: { accessMode?: VotingAccessMode; opensAt: Date | null; closesAt: Date | null }): Promise<VotingConfig> {
  const event = await eventForVoting(eventId);
  await requireOrganizer(actor, event);
  if ((input.opensAt === null) !== (input.closesAt === null) || (input.opensAt && input.closesAt && input.opensAt >= input.closesAt)) {
    throw new DogfoodError("VALIDATION_FAILED", "Set both voting dates and make the closing date later than the opening date");
  }
  let accessMode: VotingAccessMode = input.accessMode ?? "AUTHENTICATED";
  await db.transaction(async (tx) => {
    await tx.select({ id: schema.events.id }).from(schema.events).where(eq(schema.events.id, eventId)).for("update");
    const [previous] = await tx.select({ accessMode: schema.votingConfigs.accessMode }).from(schema.votingConfigs).where(eq(schema.votingConfigs.eventId, eventId)).limit(1);
    if (input.accessMode === undefined && previous) accessMode = configuredAccessMode(previous.accessMode);
    if (previous && previous.accessMode !== accessMode) {
      await tx.update(schema.votingCredentials).set({ revokedAt: new Date() }).where(and(
        eq(schema.votingCredentials.eventId, eventId), eq(schema.votingCredentials.accessMode, previous.accessMode),
        sql`${schema.votingCredentials.revokedAt} is null`,
      ));
    }
    await tx.insert(schema.votingConfigs).values({
      eventId, accessMode, opensAt: input.opensAt, closesAt: input.closesAt, updatedBy: actor.userId,
    }).onConflictDoUpdate({
      target: schema.votingConfigs.eventId,
      set: { accessMode, opensAt: input.opensAt, closesAt: input.closesAt, updatedBy: actor.userId, updatedAt: new Date() },
    });
    await appendAuditEvent(tx, {
      eventId, actorId: actor.userId, action: "voting.config.update", resourceType: "voting_config", resourceId: eventId,
      metadata: { accessMode, opensAt: input.opensAt?.toISOString() ?? null, closesAt: input.closesAt?.toISOString() ?? null },
    });
  });
  return { eventId, accessMode, opensAt: input.opensAt, closesAt: input.closesAt };
}

async function assertVotingWindow(event: EventRow): Promise<void> {
  const config = await getVotingConfig(event.id);
  const now = new Date();
  if (event.state !== "JUDGING" || !config.opensAt || !config.closesAt || now < config.opensAt || now >= config.closesAt) {
    throw new DogfoodError("CONFLICT", "Community voting is not open");
  }
}

async function assertVotingWindowInTransaction(tx: DbTx, eventId: string): Promise<VotingAccessMode> {
  const [event] = await tx.select().from(schema.events).where(eq(schema.events.id, eventId)).for("update").limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const [config] = await tx.select().from(schema.votingConfigs).where(eq(schema.votingConfigs.eventId, eventId)).for("update").limit(1);
  const opensAt = config ? config.opensAt : event.judgingOpensAt;
  const closesAt = config ? config.closesAt : event.judgingClosesAt;
  const now = new Date();
  if (event.state !== "JUDGING" || !opensAt || !closesAt || now < opensAt || now >= closesAt) {
    throw new DogfoodError("CONFLICT", "Community voting is not open");
  }
  return configuredAccessMode(config?.accessMode);
}

async function publicProjects(eventId: string) {
  return db.select({ id: schema.projects.id, title: schema.projectRevisions.title })
    .from(schema.projects)
    .innerJoin(schema.events, eq(schema.events.id, schema.projects.eventId))
    .innerJoin(schema.projectRevisions, eq(schema.projectRevisions.id, schema.projects.currentRevisionId))
    .where(and(
      eq(schema.projects.eventId, eventId),
      inArray(schema.projects.state, ["SUBMITTED", "LOCKED"]),
      inArray(schema.events.state, ["SUBMISSIONS_CLOSED", "JUDGING", "RESULTS_READY", "PUBLISHED"]),
    ));
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export async function getVotingBallot(actor: Actor | null, eventId: string, rawCredential?: string) {
  const event = await eventForVoting(eventId);
  await assertVotingWindow(event);
  const config = await getVotingConfig(eventId);
  let credentialId: string | null = null;
  if (config.accessMode === "AUTHENTICATED") {
    if (!actor) throw new DogfoodError("UNAUTHENTICATED", "Sign in to vote in this event");
  } else {
    const credential = await findCredential(eventId, rawCredential, config.accessMode);
    if (!credential) throw new DogfoodError("UNAUTHENTICATED", config.accessMode === "EMAIL_GATED" ? "Enter a valid voting invitation code" : "Voting link is unavailable; reload the ballot");
    credentialId = credential.id;
  }
  const projects = shuffle(await publicProjects(eventId));
  const [existing] = actor && config.accessMode === "AUTHENTICATED"
    ? await db.select({ id: schema.votes.id }).from(schema.votes).where(and(eq(schema.votes.eventId, eventId), eq(schema.votes.voterId, actor.userId))).limit(1)
    : await db.select({ id: schema.votes.id }).from(schema.votes).where(and(eq(schema.votes.eventId, eventId), eq(schema.votes.credentialId, credentialId!))).limit(1);
  return { eventId, accessMode: config.accessMode, hasVoted: Boolean(existing), projects };
}

async function consumeWriteLimit(actor: Actor, eventId: string, action: "vote" | "comment"): Promise<void> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [bucket] = await db.insert(schema.votingRateLimits).values({
    eventId, actorId: actor.userId, action, windowStart, count: 1,
  }).onConflictDoUpdate({
    target: [schema.votingRateLimits.eventId, schema.votingRateLimits.actorId, schema.votingRateLimits.action, schema.votingRateLimits.windowStart],
    set: { count: sql`${schema.votingRateLimits.count} + 1` },
  }).returning({ count: schema.votingRateLimits.count });
  if (bucket.count <= WRITE_LIMIT_PER_MINUTE) return;
  await db.transaction((tx) => appendAuditEvent(tx, {
    eventId, actorId: actor.userId, action: action + ".rate_limited", resourceType: action,
    metadata: { limit: WRITE_LIMIT_PER_MINUTE, windowStart: windowStart.toISOString() },
  }));
  throw new DogfoodError("RATE_LIMITED", "Too many community actions; try again in a minute");
}

async function consumeCredentialVoteLimit(eventId: string, credentialId: string): Promise<void> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [bucket] = await db.insert(schema.votingCredentialRateLimits).values({ eventId, credentialId, action: "vote", windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [schema.votingCredentialRateLimits.eventId, schema.votingCredentialRateLimits.credentialId, schema.votingCredentialRateLimits.action, schema.votingCredentialRateLimits.windowStart],
      set: { count: sql`${schema.votingCredentialRateLimits.count} + 1` },
    }).returning({ count: schema.votingCredentialRateLimits.count });
  if (bucket.count <= WRITE_LIMIT_PER_MINUTE) return;
  await db.transaction((tx) => appendAuditEvent(tx, { eventId, actorId: null, action: "vote.rate_limited", resourceType: "vote", metadata: { limit: WRITE_LIMIT_PER_MINUTE, windowStart: windowStart.toISOString() } }));
  throw new DogfoodError("RATE_LIMITED", "Too many community actions; try again in a minute");
}

async function requireVisibleProject(eventId: string, projectId: string): Promise<void> {
  const [project] = await db.select({ id: schema.projects.id })
    .from(schema.projects)
    .innerJoin(schema.events, eq(schema.events.id, schema.projects.eventId))
    .where(and(
      eq(schema.projects.id, projectId), eq(schema.projects.eventId, eventId),
      inArray(schema.projects.state, ["SUBMITTED", "LOCKED"]),
      inArray(schema.events.state, ["SUBMISSIONS_CLOSED", "JUDGING", "RESULTS_READY", "PUBLISHED"]),
    )).limit(1);
  if (!project) throw new DogfoodError("NOT_FOUND", "Project not found");
}

async function rejectProjectTeamVote(actor: Actor, eventId: string, projectId: string): Promise<void> {
  const [membership] = await db.select({ userId: schema.teamMembers.userId })
    .from(schema.teamMembers)
    .innerJoin(schema.projects, eq(schema.projects.teamId, schema.teamMembers.teamId))
    .where(and(
      eq(schema.teamMembers.eventId, eventId), eq(schema.teamMembers.userId, actor.userId),
      eq(schema.projects.id, projectId), eq(schema.projects.eventId, eventId),
    )).limit(1);
  if (!membership) return;
  await db.transaction((tx) => appendAuditEvent(tx, {
    eventId, actorId: null, action: "vote.self_attempt", resourceType: "vote",
  }));
  throw new DogfoodError("FORBIDDEN", "This vote is not allowed");
}

export async function castVote(actor: Actor | null, eventId: string, projectId: string, rawCredential?: string): Promise<void> {
  const event = await eventForVoting(eventId);
  await assertVotingWindow(event);
  const config = await getVotingConfig(eventId);
  let credentialId: string | null = null;
  if (config.accessMode === "AUTHENTICATED") {
    if (!actor) throw new DogfoodError("UNAUTHENTICATED", "Sign in to vote in this event");
  } else {
    const credential = await findCredential(eventId, rawCredential, config.accessMode);
    if (!credential) throw new DogfoodError("UNAUTHENTICATED", config.accessMode === "EMAIL_GATED" ? "Enter a valid voting invitation code" : "Voting link is unavailable; reload the ballot");
    credentialId = credential.id;
  }
  await requireVisibleProject(eventId, projectId);
  if (actor && config.accessMode === "AUTHENTICATED") await rejectProjectTeamVote(actor, eventId, projectId);
  if (actor && config.accessMode === "AUTHENTICATED") await consumeWriteLimit(actor, eventId, "vote");
  else await consumeCredentialVoteLimit(eventId, credentialId!);
  try {
    await db.transaction(async (tx) => {
      const transactionalMode = await assertVotingWindowInTransaction(tx, eventId);
      if (transactionalMode !== config.accessMode) throw new DogfoodError("CONFLICT", "Voting access settings changed; reload the ballot");
      if (config.accessMode === "AUTHENTICATED" && !actor) throw new DogfoodError("UNAUTHENTICATED", "Sign in to vote in this event");
      if (config.accessMode !== "AUTHENTICATED") {
        const [credential] = await tx.select({ id: schema.votingCredentials.id }).from(schema.votingCredentials).where(and(
          eq(schema.votingCredentials.id, credentialId!), eq(schema.votingCredentials.eventId, eventId),
          eq(schema.votingCredentials.accessMode, config.accessMode), sql`${schema.votingCredentials.revokedAt} is null`,
          gt(schema.votingCredentials.expiresAt, new Date()),
        )).for("update").limit(1);
        if (!credential) throw new DogfoodError("UNAUTHENTICATED", "This voting credential has expired or was revoked");
      }
      await tx.insert(schema.votes).values({ eventId, voterId: config.accessMode === "AUTHENTICATED" ? actor!.userId : null, credentialId, projectId });
      await appendAuditEvent(tx, { eventId, actorId: null, action: "vote.cast", resourceType: "vote" });
    });
  } catch (error) {
    if (sqlState(error) !== "23505") throw error;
    await db.transaction((tx) => appendAuditEvent(tx, { eventId, actorId: null, action: "vote.duplicate", resourceType: "vote" }));
    throw new DogfoodError("CONFLICT", "You have already voted in this event");
  }
}

export async function getVotingResults(actor: Actor, eventId: string): Promise<VotingResults> {
  const event = await eventForVoting(eventId);
  if (event.state !== "JUDGING" && event.state !== "RESULTS_READY" && event.state !== "PUBLISHED" && event.state !== "ARCHIVED") {
    throw new DogfoodError("FORBIDDEN", "Voting results are not available yet");
  }
  const config = await getVotingConfig(eventId);
  const votingHasClosed = config.closesAt !== null && config.closesAt <= new Date();
  if (event.state === "JUDGING" || !votingHasClosed) await requireOrganizer(actor, event);
  const results = await db.select({ projectId: schema.votes.projectId, votes: sql<number>`count(*)::int` })
    .from(schema.votes).where(eq(schema.votes.eventId, eventId)).groupBy(schema.votes.projectId);
  return { results };
}

export async function listProjectComments(actor: Actor, eventId: string, projectId: string): Promise<CommentRow[]> {
  if (!actor.userId) throw new DogfoodError("UNAUTHENTICATED", "Authentication required");
  const event = await eventForVoting(eventId);
  await assertVotingWindow(event);
  await requireVisibleProject(eventId, projectId);
  return db.select().from(schema.projectComments)
    .where(and(eq(schema.projectComments.eventId, eventId), eq(schema.projectComments.projectId, projectId)))
    .orderBy(desc(schema.projectComments.createdAt));
}

function validateComment(body: string): string {
  const normalized = body.trim();
  if (!normalized || normalized.length > 2000) throw new DogfoodError("VALIDATION_FAILED", "Comments must be between 1 and 2000 characters");
  return normalized;
}

export async function createProjectComment(actor: Actor, eventId: string, projectId: string, body: string): Promise<CommentRow> {
  const event = await eventForVoting(eventId);
  await assertVotingWindow(event);
  await requireVisibleProject(eventId, projectId);
  await consumeWriteLimit(actor, eventId, "comment");
  const text = validateComment(body);
  return db.transaction(async (tx) => {
    await assertVotingWindowInTransaction(tx, eventId);
    const [comment] = await tx.insert(schema.projectComments).values({ eventId, projectId, authorId: actor.userId, body: text }).returning();
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "comment.create", resourceType: "project_comment", resourceId: comment.id, metadata: { projectId } });
    return comment;
  });
}

export async function deleteProjectComment(actor: Actor, eventId: string, projectId: string, commentId: string): Promise<void> {
  await eventForVoting(eventId);
  await requireVisibleProject(eventId, projectId);
  const roles = await eventRoles(actor.userId, eventId);
  const [comment] = await db.select().from(schema.projectComments).where(and(
    eq(schema.projectComments.id, commentId), eq(schema.projectComments.eventId, eventId), eq(schema.projectComments.projectId, projectId),
  )).limit(1);
  if (!comment) throw new DogfoodError("NOT_FOUND", "Comment not found");
  const organizer = roles.includes("ORGANIZER") || actor.isPlatformAdmin;
  if (comment.authorId !== actor.userId && !organizer) throw new DogfoodError("FORBIDDEN", "You may only remove your own comment");
  await db.transaction(async (tx) => {
    await tx.delete(schema.projectComments).where(eq(schema.projectComments.id, commentId));
    await appendAuditEvent(tx, {
      eventId, actorId: actor.userId,
      action: comment.authorId === actor.userId ? "comment.delete" : "comment.moderate_delete",
      resourceType: "project_comment", resourceId: commentId, metadata: { projectId },
    });
  });
}
