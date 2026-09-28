import { and, db, desc, eq, schema, type EventRole, type EventState } from "@dogfood/db";

export type ProjectRow = typeof schema.projects.$inferSelect;
export type ProjectRevisionRow = typeof schema.projectRevisions.$inferSelect;

export async function getEventById(eventId: string): Promise<
  | {
      id: string;
      name: string;
      state: EventState;
      submissionOpensAt: Date | null;
      submissionClosesAt: Date | null;
      customQuestions: import("@dogfood/db").CustomQuestion[];
    }
  | undefined
> {
  const rows = await db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      state: schema.events.state,
      submissionOpensAt: schema.events.submissionOpensAt,
      submissionClosesAt: schema.events.submissionClosesAt,
      customQuestions: schema.events.customQuestions,
    })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return rows[0];
}

export async function getTeamById(teamId: string) {
  const rows = await db
    .select()
    .from(schema.teams)
    .where(eq(schema.teams.id, teamId))
    .limit(1);
  return rows[0];
}

export async function getTeamMember(
  teamId: string,
  userId: string,
) {
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

export async function eventMembershipRoles(
  userId: string,
  eventId: string,
): Promise<EventRole[]> {
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

export async function getProjectById(projectId: string): Promise<ProjectRow | undefined> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);
  return rows[0];
}

export async function getRevisionById(
  revisionId: string | null,
): Promise<ProjectRevisionRow | undefined> {
  if (!revisionId) return undefined;
  const rows = await db
    .select()
    .from(schema.projectRevisions)
    .where(eq(schema.projectRevisions.id, revisionId))
    .limit(1);
  return rows[0];
}

export async function getLatestRevisionNumber(
  projectId: string,
): Promise<number> {
  const rows = await db
    .select({ revisionNumber: schema.projectRevisions.revisionNumber })
    .from(schema.projectRevisions)
    .where(eq(schema.projectRevisions.projectId, projectId))
    .orderBy(desc(schema.projectRevisions.revisionNumber))
    .limit(1);
  return rows[0]?.revisionNumber ?? 0;
}

export type InsertRevisionInput = {
  projectId: string;
  revisionNumber: number;
  title: string;
  tagline: string | null;
  description: string;
  repositoryUrl: string | null;
  liveUrl: string | null;
  demoVideoUrl: string | null;
  techTags: string[];
  createdBy: string;
};

export async function insertRevision(
  input: InsertRevisionInput,
): Promise<ProjectRevisionRow> {
  const [row] = await db.insert(schema.projectRevisions).values(input).returning();
  return row;
}

export async function updateProjectCurrentRevision(
  projectId: string,
  currentRevisionId: string,
): Promise<void> {
  await db
    .update(schema.projects)
    .set({ currentRevisionId })
    .where(eq(schema.projects.id, projectId));
}

export async function setProjectSubmissionState(
  projectId: string,
  state: "DRAFT" | "SUBMITTED",
  submittedAt: Date | null,
): Promise<void> {
  await db
    .update(schema.projects)
    .set({ state, submittedAt })
    .where(eq(schema.projects.id, projectId));
}
