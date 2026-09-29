import { db, desc, eq, inArray, schema } from "@dogfood/db";
import { listJudgeApplications } from "@dogfood/applications";
import { DogfoodError } from "@dogfood/validation";
import type { Actor } from "@dogfood/shared";

type EventRow = typeof schema.events.$inferSelect;

export type OrganizerDocument = {
  event: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    state: EventRow["state"];
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    websiteUrl: string | null;
    prizeInfo: string | null;
    timeline: string | null;
    schedule: string | null;
    rules: string | null;
    maxTeamSize: number | null;
    customQuestions: EventRow["customQuestions"];
  };
  tracks: Array<{ id: string; name: string; sortOrder: number }>;
  prizes: Array<{ id: string; name: string; description: string | null; trackId: string | null; amount: string | null; currency: string | null; sortOrder: number }>;
  members: Array<{
    userId: string;
    email: string;
    displayName: string;
    role: string;
  }>;
  applications: Array<{
    id: string;
    userId: string;
    displayName: string;
    email: string;
    rationale: string | null;
    status: string;
    createdAt: Date;
    decidedAt: Date | null;
    attachmentName: string | null;
    attachmentSize: number | null;
    attachmentContentType: string | null;
  }>;
  judges: Array<{ userId: string; email: string; displayName: string }>;
  rubrics: Array<{
    id: string;
    name: string;
    version: number;
    active: boolean;
    weightSum: number;
    criteria: Array<{
      id: string;
      name: string;
      weight: number;
      minScore: number;
      maxScore: number;
      optional: boolean;
    }>;
  }>;
  projects: Array<{
    id: string;
    slug: string;
    title: string;
    teamName: string;
    state: string;
    trackId: string | null;
  }>;
  assignments: Array<{
    id: string;
    judgeEmail: string;
    judgeName: string;
    projectId: string;
    projectTitle: string;
    status: string;
    submittedAt: Date | null;
    scores: Array<{ criterion: string; score: number }>;
  }>;
  coverage: {
    total: number;
    assigned: number;
    inProgress: number;
    submitted: number;
    locked: number;
    completed: number;
  };
  allEvaluationsLocked: boolean;
  snapshots: Array<{
    id: string;
    rankingVersion: string;
    generatedAt: Date;
    publishedAt: Date | null;
  }>;
  publishedRankingSnapshotId: string | null;
  certificates: Array<{
    id: string;
    displayName: string;
    projectTitle: string;
    teamName: string | null;
    tier: string;
    rank: number | null;
    issuedAt: Date;
  }>;
  certificatesCount: number;
};

export async function getOrganizerDocument(
  actor: Actor,
  eventId: string,
): Promise<OrganizerDocument> {
  const eventRows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = eventRows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const memberships = await db
    .select()
    .from(schema.eventMemberships)
    .where(eq(schema.eventMemberships.eventId, eventId))
    .orderBy(schema.eventMemberships.createdAt);

  const isOrganizer =
    actor.isPlatformAdmin ||
    memberships.some(
      (m) => m.userId === actor.userId && m.role === "ORGANIZER",
    );
  if (!isOrganizer) {
    throw new DogfoodError(
      "FORBIDDEN",
      "You do not have organizer access to this event",
    );
  }

  const memberUserIds = [...new Set(memberships.map((m) => m.userId))];
  const memberUsers = memberUserIds.length
    ? await db
        .select()
        .from(schema.users)
        .where(inArray(schema.users.id, memberUserIds))
    : [];
  const userById = new Map(memberUsers.map((user) => [user.id, user]));

  const members: OrganizerDocument["members"] = memberships.map(
    (membership) => {
      const user = userById.get(membership.userId);
      return {
        userId: membership.userId,
        email: user?.email ?? "unknown",
        displayName: user?.displayName ?? "unknown",
        role: membership.role,
      };
    },
  );

  const rubrics = await db
    .select()
    .from(schema.rubrics)
    .where(eq(schema.rubrics.eventId, eventId))
    .orderBy(desc(schema.rubrics.createdAt));

  const rubricIds = rubrics.map((r) => r.id);
  const criteria = rubricIds.length
    ? await db
        .select()
        .from(schema.rubricCriteria)
        .where(inArray(schema.rubricCriteria.rubricId, rubricIds))
        .orderBy(schema.rubricCriteria.sortOrder)
    : [];

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.eventId, eventId))
    .orderBy(schema.projects.createdAt);

  const teamIds = [...new Set(projects.map((p) => p.teamId))].filter(
    (id): id is string => Boolean(id),
  );
  const teams = teamIds.length
    ? await db.select().from(schema.teams).where(inArray(schema.teams.id, teamIds))
    : [];
  const teamById = new Map(teams.map((team) => [team.id, team]));

  const revisionIds = projects
    .map((p) => p.currentRevisionId)
    .filter((id): id is string => Boolean(id));
  const revisions = revisionIds.length
    ? await db
        .select()
        .from(schema.projectRevisions)
        .where(inArray(schema.projectRevisions.id, revisionIds))
    : [];
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision]),
  );

  const assignmentRows = await db
    .select()
    .from(schema.judgeAssignments)
    .where(eq(schema.judgeAssignments.eventId, eventId))
    .orderBy(schema.judgeAssignments.assignedAt);

  const judgeIds = [...new Set(assignmentRows.map((a) => a.judgeId))];
  const judgeUsers = judgeIds.length
    ? await db
        .select()
        .from(schema.users)
        .where(inArray(schema.users.id, judgeIds))
    : [];
  const judgeById = new Map(judgeUsers.map((user) => [user.id, user]));

  const evaluationRows = assignmentRows.length
    ? await db
        .select()
        .from(schema.evaluations)
        .where(
          inArray(
            schema.evaluations.assignmentId,
            assignmentRows.map((a) => a.id),
          ),
        )
    : [];
  const evaluationByAssignment = new Map(
    evaluationRows.map((evaluation) => [evaluation.assignmentId, evaluation]),
  );

  const scoreRows = evaluationRows.length
    ? await db
        .select()
        .from(schema.evaluationScores)
        .where(
          inArray(
            schema.evaluationScores.evaluationId,
            evaluationRows.map((e) => e.id),
          ),
        )
    : [];
  const criterionName = new Map(criteria.map((c) => [c.id, c.name]));
  const criterionOrder = new Map(criteria.map((c) => [c.id, c.sortOrder]));
  const scoresByEvaluation = new Map<string, typeof scoreRows>();
  for (const row of scoreRows) {
    const list = scoresByEvaluation.get(row.evaluationId) ?? [];
    list.push(row);
    scoresByEvaluation.set(row.evaluationId, list);
  }

  const snapshots = await db
    .select()
    .from(schema.rankingSnapshots)
    .where(eq(schema.rankingSnapshots.eventId, eventId))
    .orderBy(desc(schema.rankingSnapshots.generatedAt));

  const projectById = new Map(projects.map((project) => [project.id, project]));

  const certificateRows = await db
    .select()
    .from(schema.certificates)
    .where(eq(schema.certificates.eventId, eventId))
    .orderBy(desc(schema.certificates.issuedAt));

  const applications = await listJudgeApplications(actor, eventId);
  const tracks = await db.select({ id: schema.eventTracks.id, name: schema.eventTracks.name, sortOrder: schema.eventTracks.sortOrder })
    .from(schema.eventTracks).where(eq(schema.eventTracks.eventId, eventId)).orderBy(schema.eventTracks.sortOrder);
  const prizes = await db.select({ id: schema.eventPrizes.id, name: schema.eventPrizes.name, description: schema.eventPrizes.description, trackId: schema.eventPrizes.trackId, amount: schema.eventPrizes.amount, currency: schema.eventPrizes.currency, sortOrder: schema.eventPrizes.sortOrder })
    .from(schema.eventPrizes).where(eq(schema.eventPrizes.eventId, eventId)).orderBy(schema.eventPrizes.sortOrder, schema.eventPrizes.createdAt);

  return {
    event: {
      id: event.id,
      slug: event.slug,
      name: event.name,
      description: event.description,
    state: event.state,
    registrationOpensAt: event.registrationOpensAt,
    registrationClosesAt: event.registrationClosesAt,
    websiteUrl: event.websiteUrl,
    prizeInfo: event.prizeInfo,
    timeline: event.timeline,
    schedule: event.schedule,
    rules: event.rules,
    maxTeamSize: event.maxTeamSize,
    customQuestions: event.customQuestions,
  },
    tracks,
    prizes,
    members,
    applications: applications.map((application) => ({
      id: application.id,
      userId: application.userId,
      displayName: application.displayName,
      email: application.email,
      rationale: application.rationale,
      status: application.status,
      createdAt: application.createdAt,
      decidedAt: application.decidedAt,
      attachmentName: application.attachmentName,
      attachmentSize: application.attachmentSize,
      attachmentContentType: application.attachmentContentType,
    })),
    judges: members.filter((m) => m.role === "JUDGE"),
    rubrics: rubrics.map((rubric) => {
      const rubricCriteria = criteria.filter((c) => c.rubricId === rubric.id);
      return {
        id: rubric.id,
        name: rubric.name,
        version: rubric.version,
        active: rubric.active,
        weightSum: rubricCriteria.reduce(
          (sum, c) => sum + Number(c.weight),
          0,
        ),
        criteria: rubricCriteria.map((c) => ({
          id: c.id,
          name: c.name,
          weight: Number(c.weight),
          minScore: Number(c.minScore),
          maxScore: Number(c.maxScore),
          optional: c.isOptional,
        })),
      };
    }),
    projects: projects.map((project) => {
      const team = project.teamId ? teamById.get(project.teamId) : undefined;
      const revision = project.currentRevisionId
        ? revisionById.get(project.currentRevisionId)
        : undefined;
      return {
        id: project.id,
        slug: project.slug,
        title: revision?.title ?? "(no revision)",
        teamName: team?.name ?? "(no team)",
        state: project.state,
        trackId: revision?.trackId ?? null,
      };
    }),
    assignments: assignmentRows.map((assignment) => {
      const judge = judgeById.get(assignment.judgeId);
      const project = projectById.get(assignment.projectId);
      const revision = project?.currentRevisionId
        ? revisionById.get(project.currentRevisionId)
        : undefined;
      const evaluation = evaluationByAssignment.get(assignment.id);
      return {
        id: assignment.id,
        judgeEmail: judge?.email ?? "unknown",
        judgeName: judge?.displayName ?? "unknown",
        projectId: assignment.projectId,
        projectTitle: revision?.title ?? "(no revision)",
        status: assignment.status,
        submittedAt: evaluation?.submittedAt ?? null,
        scores: (evaluation ? scoresByEvaluation.get(evaluation.id) ?? [] : [])
          .sort(
            (a, b) =>
              (criterionOrder.get(a.criterionId) ?? 0) -
              (criterionOrder.get(b.criterionId) ?? 0),
          )
          .map((row) => ({
            criterion: criterionName.get(row.criterionId) ?? "Criterion",
            score: Number(row.score),
          })),
      };
    }),
    coverage: assignmentRows.reduce(
      (acc, assignment) => {
        acc.total += 1;
        if (assignment.status === "ASSIGNED") acc.assigned += 1;
        if (assignment.status === "IN_PROGRESS") acc.inProgress += 1;
        if (assignment.status === "SUBMITTED") acc.submitted += 1;
        if (assignment.status === "LOCKED") acc.locked += 1;
        if (
          assignment.status === "SUBMITTED" ||
          assignment.status === "LOCKED"
        ) {
          acc.completed += 1;
        }
        return acc;
      },
      {
        total: 0,
        assigned: 0,
        inProgress: 0,
        submitted: 0,
        locked: 0,
        completed: 0,
      },
    ),
    allEvaluationsLocked:
      assignmentRows.length > 0 &&
      assignmentRows.every((a) => a.status === "LOCKED"),
    snapshots: snapshots.map((snapshot) => ({
      id: snapshot.id,
      rankingVersion: snapshot.rankingVersion,
      generatedAt: snapshot.generatedAt,
      publishedAt: snapshot.publishedAt,
    })),
    publishedRankingSnapshotId: event.publishedRankingSnapshotId,
    certificates: certificateRows.map((certificate) => ({
      id: certificate.id,
      displayName: certificate.displayName,
      projectTitle: certificate.projectTitle,
      teamName: certificate.teamName,
      tier: certificate.tier,
      rank: certificate.rank,
      issuedAt: certificate.issuedAt,
    })),
    certificatesCount: certificateRows.length,
  };
}
