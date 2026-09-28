import { createHash, randomBytes } from "node:crypto";

import { and, db, eq, schema, sql, sqlState, type EventState } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

import {
  countTeamMembers,
  eventMembershipRoles,
  findInviteByTokenHash,
  getEventState,
  getEventTeamRules,
  getMembership,
  getTeamById,
  getTeamMembers,
  getTeamMembersWithProfiles,
  type TeamMemberProfile,
} from "./repository";

export type CreateTeamInput = { name: string };

export type TeamDetail = {
  id: string;
  eventId: string;
  name: string;
  isOwner: boolean;
  ownerIds: string[];
  members: TeamMemberProfile[];
  maxTeamSize: number | null;
  memberCount: number;
  rosterLocked: boolean;
};

const LOCKED_ROSTER_STATES: EventState[] = [
  "SUBMISSIONS_OPEN",
  "SUBMISSIONS_CLOSED",
  "JUDGING",
  "RESULTS_READY",
  "PUBLISHED",
  "ARCHIVED",
];

export function isTeamRosterLocked(state: string): boolean {
  return LOCKED_ROSTER_STATES.includes(state as EventState);
}

function assertRosterUnlocked(state: string): void {
  if (isTeamRosterLocked(state)) {
    throw new DogfoodError(
      "TEAM_RULE_VIOLATION",
      "Team membership is locked because submissions for this event are open",
    );
  }
}

function assertTeamCapacity(
  currentCount: number,
  maxTeamSize: number | null,
  adding: number,
): void {
  if (maxTeamSize !== null && currentCount + adding > maxTeamSize) {
    throw new DogfoodError(
      "TEAM_RULE_VIOLATION",
      `This event allows a maximum of ${maxTeamSize} ${
        maxTeamSize === 1 ? "person" : "people"
      } per team`,
    );
  }
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

async function requireParticipant(
  actor: Actor,
  eventId: string,
  action: typeof ACTION.TEAM_JOIN | typeof ACTION.TEAM_MANAGE,
): Promise<void> {
  const eventState = (await getEventState(eventId)) as EventState | undefined;
  if (!eventState) throw new DogfoodError("NOT_FOUND", "Event not found");
  const roles = await eventMembershipRoles(actor.userId, eventId);
  requirePermission(actor, action, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState,
  });
}

async function toTeamDetail(
  teamId: string,
  viewerUserId: string,
): Promise<TeamDetail> {
  const team = await getTeamById(teamId);
  if (!team) throw new DogfoodError("NOT_FOUND", "Team not found");
  const members = await getTeamMembers(teamId);
  const my = members.find((m) => m.userId === viewerUserId);
  if (!my) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Actor is not a team member",
    );
  }
  const rules = await getEventTeamRules(team.eventId);
  const profiles = await getTeamMembersWithProfiles(teamId);
  return {
    id: team.id,
    eventId: team.eventId,
    name: team.name,
    isOwner: my.isOwner,
    ownerIds: members.filter((m) => m.isOwner).map((m) => m.userId),
    members: profiles,
    maxTeamSize: rules?.maxTeamSize ?? null,
    memberCount: members.length,
    rosterLocked: isTeamRosterLocked(rules?.state ?? "DRAFT"),
  };
}

export async function createTeam(
  actor: Actor,
  eventId: string,
  input: CreateTeamInput,
): Promise<TeamDetail> {
  await requireParticipant(actor, eventId, ACTION.TEAM_JOIN);

  const rules = await getEventTeamRules(eventId);
  assertRosterUnlocked(rules?.state ?? "DRAFT");
  assertTeamCapacity(0, rules?.maxTeamSize ?? null, 1);

  let teamId: string;
  try {
    teamId = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(schema.teams)
        .values({ eventId, name: input.name, createdBy: actor.userId })
        .returning();
      await tx.insert(schema.teamMembers).values({
        eventId,
        teamId: team.id,
        userId: actor.userId,
        isOwner: true,
      });
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "team.create",
        resourceType: "team",
        resourceId: team.id,
        metadata: { name: input.name },
      });
      return team.id;
    });
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError(
        "TEAM_RULE_VIOLATION",
        "A participant can belong to only one team per event",
      );
    }
    throw error;
  }
  return toTeamDetail(teamId, actor.userId);
}

export async function createTeamInvite(
  actor: Actor,
  teamId: string,
  _input: Record<string, never>,
): Promise<{ rawToken: string }> {
  const team = await getTeamById(teamId);
  if (!team) throw new DogfoodError("NOT_FOUND", "Team not found");
  const my = await getMembership(teamId, actor.userId);
  if (!my || !my.isOwner) {
    throw new DogfoodError(
      "FORBIDDEN",
      "[FORBIDDEN] Only a team owner can create invites",
    );
  }

  const rawToken = randomBytes(9).toString("base64url").replace(/[_-]/g, ""); // ~12 chars
  await db.transaction(async (tx) => {
    const [invite] = await tx.insert(schema.teamInvites).values({
      teamId,
      tokenHash: hashToken(rawToken),
      createdBy: actor.userId,
    }).returning({ id: schema.teamInvites.id });
    await appendAuditEvent(tx, {
      eventId: team.eventId,
      actorId: actor.userId,
      action: "team.invite.create",
      resourceType: "team_invite",
      resourceId: invite.id,
      metadata: { teamId: team.id },
    });
  });
  return { rawToken };
}

export async function joinTeam(
  actor: Actor,
  eventId: string,
  rawInviteToken: string,
): Promise<TeamDetail> {
  const invite = await findInviteByTokenHash(hashToken(rawInviteToken));
  if (!invite) throw new DogfoodError("NOT_FOUND", "Invitation not found");
  if (invite.revokedAt) throw new DogfoodError("NOT_FOUND", "Invitation not found");
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new DogfoodError("INVITATION_INVALID", "Invitation has expired");
  }

  const team = await getTeamById(invite.teamId);
  if (!team || team.eventId !== eventId) {
    throw new DogfoodError("NOT_FOUND", "Team not found");
  }

  await requireParticipant(actor, team.eventId, ACTION.TEAM_JOIN);

  const rules = await getEventTeamRules(team.eventId);
  assertRosterUnlocked(rules?.state ?? "DRAFT");
  assertTeamCapacity(
    await countTeamMembers(team.id),
    rules?.maxTeamSize ?? null,
    1,
  );

  try {
    await db.transaction(async (tx) => {
      await tx.insert(schema.teamMembers).values({
        eventId,
        teamId: team.id,
        userId: actor.userId,
        isOwner: false,
      });
      await tx
        .update(schema.teamInvites)
        .set({ useCount: sql`${schema.teamInvites.useCount} + 1` })
        .where(
          sql`${schema.teamInvites.id} = ${invite.id}`,
        );
      await appendAuditEvent(tx, {
        eventId,
        actorId: actor.userId,
        action: "team.join",
        resourceType: "team",
        resourceId: team.id,
        metadata: { inviteId: invite.id },
      });
    });
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError(
        "TEAM_RULE_VIOLATION",
        "A participant can belong to only one team per event",
      );
    }
    throw error;
  }
  return toTeamDetail(team.id, actor.userId);
}

export async function leaveTeam(
  actor: Actor,
  teamId: string,
): Promise<void> {
  const team = await getTeamById(teamId);
  if (!team) throw new DogfoodError("NOT_FOUND", "Team not found");
  await requireParticipant(actor, team.eventId, ACTION.TEAM_MANAGE);

  const rules = await getEventTeamRules(team.eventId);
  assertRosterUnlocked(rules?.state ?? "DRAFT");

  const my = await getMembership(teamId, actor.userId);
  if (!my) throw new DogfoodError("FORBIDDEN", "[FORBIDDEN] Actor is not a team member");
  await db.transaction(async (tx) => {
    await tx.delete(schema.teamMembers).where(and(
      eq(schema.teamMembers.teamId, teamId),
      eq(schema.teamMembers.userId, actor.userId),
    ));
    await appendAuditEvent(tx, {
      eventId: team.eventId,
      actorId: actor.userId,
      action: "team.leave",
      resourceType: "team",
      resourceId: team.id,
      metadata: { memberId: actor.userId },
    });
  });
}

export async function getTeam(
  actor: Actor,
  teamId: string,
): Promise<TeamDetail> {
  const team = await getTeamById(teamId);
  if (!team) throw new DogfoodError("NOT_FOUND", "Team not found");
  await requireParticipant(actor, team.eventId, ACTION.TEAM_MANAGE);
  return toTeamDetail(teamId, actor.userId);
}
