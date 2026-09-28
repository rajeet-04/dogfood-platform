import { createHash, randomBytes } from "node:crypto";

import { and, db, eq, gt, schema, sql } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type JudgeInvitationView = {
  id: string;
  eventId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function authorizeOrganizer(actor: Actor, eventId: string): Promise<void> {
  const [event] = await db.select({ state: schema.events.state }).from(schema.events)
    .where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const memberships = await db.select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(and(
      eq(schema.eventMemberships.eventId, eventId),
      eq(schema.eventMemberships.userId, actor.userId),
      eq(schema.eventMemberships.isActive, true),
    ));
  requirePermission(actor, ACTION.MEMBER_INVITE, {
    eventId,
    resourceEventId: eventId,
    roles: memberships.map(({ role }) => role),
    eventState: event.state,
  });
}

export async function listJudgeInvitations(actor: Actor, eventId: string): Promise<JudgeInvitationView[]> {
  await authorizeOrganizer(actor, eventId);
  return db.select({
    id: schema.judgeInvitations.id,
    eventId: schema.judgeInvitations.eventId,
    email: schema.judgeInvitations.email,
    createdAt: schema.judgeInvitations.createdAt,
    expiresAt: schema.judgeInvitations.expiresAt,
    acceptedAt: schema.judgeInvitations.acceptedAt,
    revokedAt: schema.judgeInvitations.revokedAt,
  }).from(schema.judgeInvitations)
    .where(eq(schema.judgeInvitations.eventId, eventId))
    .orderBy(sql`${schema.judgeInvitations.createdAt} desc`);
}

export async function createJudgeInvitation(
  actor: Actor,
  eventId: string,
  emailInput: string,
): Promise<{ invitation: JudgeInvitationView; token: string }> {
  await authorizeOrganizer(actor, eventId);
  const email = normalizeEmail(emailInput);
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new DogfoodError("VALIDATION_FAILED", "Enter a valid email address");
  }
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_LIFETIME_MS);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(schema.judgeInvitations).values({
      eventId,
      email,
      tokenHash: digest(token),
      createdBy: actor.userId,
      expiresAt,
    }).returning({
      id: schema.judgeInvitations.id,
      eventId: schema.judgeInvitations.eventId,
      email: schema.judgeInvitations.email,
      createdAt: schema.judgeInvitations.createdAt,
      expiresAt: schema.judgeInvitations.expiresAt,
      acceptedAt: schema.judgeInvitations.acceptedAt,
      revokedAt: schema.judgeInvitations.revokedAt,
    });
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_invitation.create",
      resourceType: "judge_invitation",
      resourceId: row.id,
      metadata: { email, expiresAt: expiresAt.toISOString() },
    });
    return { invitation: row, token };
  });
}

export async function revokeJudgeInvitation(
  actor: Actor,
  eventId: string,
  invitationId: string,
): Promise<JudgeInvitationView> {
  await authorizeOrganizer(actor, eventId);
  return db.transaction(async (tx) => {
    const [row] = await tx.update(schema.judgeInvitations)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(schema.judgeInvitations.id, invitationId),
        eq(schema.judgeInvitations.eventId, eventId),
        sql`${schema.judgeInvitations.acceptedAt} is null`,
        sql`${schema.judgeInvitations.revokedAt} is null`,
        gt(schema.judgeInvitations.expiresAt, new Date()),
      ))
      .returning({
        id: schema.judgeInvitations.id,
        eventId: schema.judgeInvitations.eventId,
        email: schema.judgeInvitations.email,
        createdAt: schema.judgeInvitations.createdAt,
        expiresAt: schema.judgeInvitations.expiresAt,
        acceptedAt: schema.judgeInvitations.acceptedAt,
        revokedAt: schema.judgeInvitations.revokedAt,
      });
    if (!row) throw new DogfoodError("INVITATION_INVALID", "Invitation is no longer active");
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_invitation.revoke",
      resourceType: "judge_invitation",
      resourceId: invitationId,
      metadata: { email: row.email },
    });
    return row;
  });
}

export async function acceptJudgeInvitation(
  actor: Actor,
  eventId: string,
  token: string,
): Promise<{ eventId: string; role: "JUDGE" }> {
  const tokenHash = digest(token);
  return db.transaction(async (tx) => {
    const [invite] = await tx.select().from(schema.judgeInvitations)
      .where(and(
        eq(schema.judgeInvitations.eventId, eventId),
        eq(schema.judgeInvitations.tokenHash, tokenHash),
      )).limit(1);
    if (!invite || invite.revokedAt || invite.acceptedAt || invite.expiresAt <= new Date()) {
      throw new DogfoodError("INVITATION_INVALID", "Invitation is invalid or no longer active");
    }
    const [user] = await tx.select({ email: schema.users.email }).from(schema.users)
      .where(eq(schema.users.id, actor.userId)).limit(1);
    if (!user || normalizeEmail(user.email) !== invite.email) {
      throw new DogfoodError("INVITATION_INVALID", "Invitation is invalid or no longer active");
    }
    const existing = await tx.select({ id: schema.eventMemberships.id })
      .from(schema.eventMemberships)
      .where(and(eq(schema.eventMemberships.eventId, eventId), eq(schema.eventMemberships.userId, actor.userId)))
      .limit(1);
    if (existing.length) throw new DogfoodError("CONFLICT", "This account already has an event role");

    const now = new Date();
    const [claimed] = await tx.update(schema.judgeInvitations)
      .set({ acceptedAt: now, acceptedBy: actor.userId })
      .where(and(
        eq(schema.judgeInvitations.id, invite.id),
        sql`${schema.judgeInvitations.acceptedAt} is null`,
        sql`${schema.judgeInvitations.revokedAt} is null`,
        gt(schema.judgeInvitations.expiresAt, now),
      )).returning({ id: schema.judgeInvitations.id });
    if (!claimed) throw new DogfoodError("INVITATION_INVALID", "Invitation is invalid or no longer active");

    await tx.insert(schema.eventMemberships).values({ eventId, userId: actor.userId, role: "JUDGE" });
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "judge_invitation.accept",
      resourceType: "judge_invitation",
      resourceId: invite.id,
      metadata: { email: invite.email },
    });
    return { eventId, role: "JUDGE" };
  });
}
