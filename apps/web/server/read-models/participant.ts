import { and, db, desc, eq, schema } from "@dogfood/db";
import { isTeamRosterLocked } from "@dogfood/teams";
import { DogfoodError } from "@dogfood/validation";
import type { Actor } from "@dogfood/shared";

type EventRow = typeof schema.events.$inferSelect;
type TeamRow = typeof schema.teams.$inferSelect;
type ProjectRow = typeof schema.projects.$inferSelect;
type RevisionRow = typeof schema.projectRevisions.$inferSelect;

export type RevisionSummary = {
  id: string;
  revisionNumber: number;
  title: string;
  createdAt: Date;
  createdBy: string;
};

export type ParticipantHome = {
  event: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    state: EventRow["state"];
    submissionOpensAt: EventRow["submissionOpensAt"];
    submissionClosesAt: EventRow["submissionClosesAt"];
    customQuestions: EventRow["customQuestions"];
  };
  tracks: Array<{ id: string; name: string }>;
  serverNow: Date;
  teamRosterLocked: boolean;
  team: {
    id: string;
    name: string;
    isOwner: boolean;
    members: Array<{
      userId: string;
      displayName: string;
      email: string;
      isOwner: boolean;
    }>;
    memberCount: number;
    maxTeamSize: number | null;
    rosterLocked: boolean;
  } | null;
  project:
    | {
        id: string;
        state: ProjectRow["state"];
        submittedAt: ProjectRow["submittedAt"];
        lockedAt: ProjectRow["lockedAt"];
        currentRevision: {
          id: string;
          title: string;
          tagline: string | null;
          description: string;
          repositoryUrl: string | null;
          liveUrl: string | null;
          demoVideoUrl: string | null;
          techTags: string[];
          trackId: string | null;
          thumbnailAssetId: string | null;
          imageAssetIds: string[];
          customAnswers: Record<string, string>;
        };
      }
    | null;
  revisions: RevisionSummary[];
};

export async function getParticipantHome(
  actor: Actor,
  eventId: string,
): Promise<ParticipantHome> {
  const eventRows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = eventRows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const memberships = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.userId, actor.userId),
      ),
    );
  if (!memberships.some((m) => m.role === "PARTICIPANT")) {
    throw new DogfoodError("FORBIDDEN", "You are not a participant of this event");
  }

  const tracks = await db
    .select({ id: schema.eventTracks.id, name: schema.eventTracks.name })
    .from(schema.eventTracks)
    .where(eq(schema.eventTracks.eventId, eventId))
    .orderBy(schema.eventTracks.sortOrder, schema.eventTracks.name);

  let team: TeamRow | undefined;
  let teamIsOwner = false;
  let project: ProjectRow | undefined;
  let teamMembers: Array<{
    userId: string;
    displayName: string;
    email: string;
    isOwner: boolean;
  }> = [];

  const teamMemberRows = await db
    .select()
    .from(schema.teamMembers)
    .where(
      and(
        eq(schema.teamMembers.eventId, eventId),
        eq(schema.teamMembers.userId, actor.userId),
      ),
    )
    .limit(1);
  const teamMember = teamMemberRows[0];
  if (teamMember) {
    teamIsOwner = teamMember.isOwner;
    const teamRows = await db
      .select()
      .from(schema.teams)
      .where(eq(schema.teams.id, teamMember.teamId))
      .limit(1);
    team = teamRows[0];

    teamMembers = await db
      .select({
        userId: schema.teamMembers.userId,
        displayName: schema.users.displayName,
        email: schema.users.email,
        isOwner: schema.teamMembers.isOwner,
      })
      .from(schema.teamMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
      .where(eq(schema.teamMembers.teamId, teamMember.teamId))
      .orderBy(schema.teamMembers.joinedAt);

    const projectRows = await db
      .select()
      .from(schema.projects)
      .where(
        and(
          eq(schema.projects.eventId, eventId),
          eq(schema.projects.teamId, teamMember.teamId),
        ),
      )
      .limit(1);
    project = projectRows[0];
  }

  let currentRevision: RevisionRow | null = null;
  let imageAssetIds: string[] = [];
  let revisions: RevisionRow[] = [];
  if (project) {
    if (project.currentRevisionId) {
      const revisionRows = await db
        .select()
        .from(schema.projectRevisions)
        .where(eq(schema.projectRevisions.id, project.currentRevisionId))
        .limit(1);
      currentRevision = revisionRows[0] ?? null;
      if (currentRevision) {
        const images = await db
          .select({ assetId: schema.projectRevisionImages.assetId })
          .from(schema.projectRevisionImages)
          .where(eq(schema.projectRevisionImages.revisionId, currentRevision.id))
          .orderBy(schema.projectRevisionImages.position);
        imageAssetIds = images.map((image) => image.assetId);
      }
    }
    revisions = await db
      .select()
      .from(schema.projectRevisions)
      .where(eq(schema.projectRevisions.projectId, project.id))
      .orderBy(desc(schema.projectRevisions.revisionNumber))
      .limit(50);
  }

  return {
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      description: event.description,
      state: event.state,
      submissionOpensAt: event.submissionOpensAt,
      submissionClosesAt: event.submissionClosesAt,
      customQuestions: event.customQuestions,
    },
    tracks,
    serverNow: new Date(),
    teamRosterLocked: isTeamRosterLocked(event.state),
    team: team
      ? {
          id: team.id,
          name: team.name,
          isOwner: teamIsOwner,
          members: teamMembers,
          memberCount: teamMembers.length,
          maxTeamSize: event.maxTeamSize,
          rosterLocked: isTeamRosterLocked(event.state),
        }
      : null,
    project: project
      ? {
          id: project.id,
          state: project.state,
          submittedAt: project.submittedAt,
          lockedAt: project.lockedAt,
          currentRevision: {
            id: currentRevision?.id ?? "",
            title: currentRevision?.title ?? "",
            tagline: currentRevision?.tagline ?? null,
            description: currentRevision?.description ?? "",
            repositoryUrl: currentRevision?.repositoryUrl ?? null,
            liveUrl: currentRevision?.liveUrl ?? null,
            demoVideoUrl: currentRevision?.demoVideoUrl ?? null,
            techTags: currentRevision?.techTags ?? [],
            trackId: currentRevision?.trackId ?? null,
            thumbnailAssetId: currentRevision?.thumbnailAssetId ?? null,
            imageAssetIds,
            customAnswers: currentRevision?.customAnswers ?? {},
          },
        }
      : null,
    revisions: revisions.map((revision) => ({
      id: revision.id,
      revisionNumber: revision.revisionNumber,
      title: revision.title,
      createdAt: revision.createdAt,
      createdBy: revision.createdBy,
    })),
  };
}
