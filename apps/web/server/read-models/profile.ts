import { db, desc, eq, schema } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { getUserById } from "@dogfood/auth";

export type ProfileMembership = {
  eventId: string;
  eventName: string;
  eventSlug: string;
  eventState: string;
  role: "PARTICIPANT" | "JUDGE" | "ORGANIZER";
  teamName: string | null;
  isTeamLeader: boolean;
};

export type Profile = {
  id: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  memberships: ProfileMembership[];
  certificates: Array<{ id: string; eventName: string }>;
};

export async function getProfile(actor: Actor): Promise<Profile> {
  const user = await getUserById(actor.userId);

  const membershipRows = await db
    .select({
      eventId: schema.events.id,
      eventName: schema.events.name,
      eventSlug: schema.events.slug,
      eventState: schema.events.state,
      role: schema.eventMemberships.role,
      createdBy: schema.events.createdBy,
    })
    .from(schema.eventMemberships)
    .innerJoin(schema.events, eq(schema.events.id, schema.eventMemberships.eventId))
    .where(eq(schema.eventMemberships.userId, actor.userId))
    .orderBy(desc(schema.events.createdAt));

  const teamMemberRows = await db
    .select({
      eventId: schema.teamMembers.eventId,
      teamName: schema.teams.name,
      isOwner: schema.teamMembers.isOwner,
    })
    .from(schema.teamMembers)
    .innerJoin(schema.teams, eq(schema.teams.id, schema.teamMembers.teamId))
    .where(eq(schema.teamMembers.userId, actor.userId));

  const teamByEvent = new Map(
    teamMemberRows.map((row) => [row.eventId, row]),
  );

  const certificateRows = await db
    .select({
      id: schema.certificates.id,
      eventName: schema.events.name,
    })
    .from(schema.certificates)
    .innerJoin(schema.events, eq(schema.events.id, schema.certificates.eventId))
    .where(eq(schema.certificates.userId, actor.userId))
    .orderBy(desc(schema.certificates.issuedAt));

  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isPlatformAdmin: actor.isPlatformAdmin,
    memberships: membershipRows.map((row) => {
      const team = teamByEvent.get(row.eventId);
      return {
        eventId: row.eventId,
        eventName: row.eventName,
        eventSlug: row.eventSlug,
        eventState: row.eventState,
        role: row.role,
        teamName: team?.teamName ?? null,
        isTeamLeader: team?.isOwner ?? false,
      };
    }),
    certificates: certificateRows,
  };
}
