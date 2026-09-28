import { and, db, eq, schema, sql } from "@dogfood/db";

export type TeamRow = typeof schema.teams.$inferSelect;
export type TeamMemberRow = typeof schema.teamMembers.$inferSelect;
export type TeamInviteRow = typeof schema.teamInvites.$inferSelect;

export async function insertTeam(
  input: { eventId: string; name: string; createdBy: string },
): Promise<TeamRow> {
  const [row] = await db
    .insert(schema.teams)
    .values(input)
    .returning();
  return row;
}

export async function insertTeamMember(input: {
  eventId: string;
  teamId: string;
  userId: string;
  isOwner: boolean;
}): Promise<TeamMemberRow> {
  const [row] = await db
    .insert(schema.teamMembers)
    .values(input)
    .returning();
  return row;
}

export async function getTeamById(teamId: string): Promise<TeamRow | undefined> {
  const rows = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  return rows[0];
}

export async function getTeamMembers(
  teamId: string,
): Promise<TeamMemberRow[]> {
  return db
    .select()
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.teamId, teamId));
}

export async function getTeamMembersWithProfiles(
  teamId: string,
): Promise<TeamMemberProfile[]> {
  return db
    .select({
      userId: schema.teamMembers.userId,
      displayName: schema.users.displayName,
      email: schema.users.email,
      isOwner: schema.teamMembers.isOwner,
      joinedAt: schema.teamMembers.joinedAt,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
    .where(eq(schema.teamMembers.teamId, teamId))
    .orderBy(schema.teamMembers.joinedAt);
}

export type TeamMemberProfile = {
  userId: string;
  displayName: string;
  email: string;
  isOwner: boolean;
  joinedAt: Date;
};

export async function getMembership(
  teamId: string,
  userId: string,
): Promise<TeamMemberRow | undefined> {
  const rows = await db
    .select()
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, teamId),
        eq(schema.teamMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0];
}

export async function deleteTeamMember(
  teamId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.teamId, teamId),
        eq(schema.teamMembers.userId, userId),
      ),
    );
}

export async function insertInvite(input: {
  teamId: string;
  tokenHash: string;
  createdBy: string;
}): Promise<TeamInviteRow> {
  const [row] = await db
    .insert(schema.teamInvites)
    .values(input)
    .returning();
  return row;
}

export async function findInviteByTokenHash(
  tokenHash: string,
): Promise<TeamInviteRow | undefined> {
  const rows = await db
    .select()
    .from(schema.teamInvites)
    .where(eq(schema.teamInvites.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

export async function markInviteUsed(inviteId: string): Promise<void> {
  await db
    .update(schema.teamInvites)
    .set({ useCount: sql`${schema.teamInvites.useCount} + 1` })
    .where(eq(schema.teamInvites.id, inviteId));
}

export async function eventMembershipRoles(
  userId: string,
  eventId: string,
): Promise<Array<"PARTICIPANT" | "JUDGE" | "ORGANIZER">> {
  const rows = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, userId),
        eq(schema.eventMemberships.eventId, eventId),
      ),
    );
  return rows.map((row) => row.role);
}

export async function getEventState(eventId: string): Promise<string | undefined> {
  const rows = await db
    .select({ state: schema.events.state })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return rows[0]?.state;
}

export async function getEventTeamRules(eventId: string): Promise<{
  state: string;
  maxTeamSize: number | null;
} | null> {
  const rows = await db
    .select({ state: schema.events.state, maxTeamSize: schema.events.maxTeamSize })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const row = rows[0];
  return row ? { state: row.state, maxTeamSize: row.maxTeamSize } : null;
}

export async function countTeamMembers(teamId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.teamMembers)
    .where(eq(schema.teamMembers.teamId, teamId));
  return rows[0]?.n ?? 0;
}