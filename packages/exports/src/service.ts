import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  schema,
  sql,
} from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { buildCsv, type CsvCell } from "./csv";

export type CsvExport = {
  filename: string;
  content: string;
};

export type ExportBuilder = (
  actor: Actor,
  eventId: string,
) => Promise<CsvExport>;

async function requireExportPermission(
  actor: Actor,
  eventId: string,
): Promise<void> {
  const [event] = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
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

  requirePermission(actor, ACTION.EXPORT_EVENT, {
    eventId,
    resourceEventId: eventId,
    roles: memberships.map((membership) => membership.role),
    eventState: event.state,
  });
}

export async function exportParticipants(
  actor: Actor,
  eventId: string,
): Promise<CsvExport> {
  await requireExportPermission(actor, eventId);

  const rows = await db
    .select({
      email: schema.users.email,
      displayName: schema.users.displayName,
      role: schema.eventMemberships.role,
      joinedAt: schema.eventMemberships.createdAt,
    })
    .from(schema.eventMemberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.eventMemberships.userId))
    .where(
      and(
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.isActive, true),
      ),
    )
    .orderBy(asc(schema.eventMemberships.createdAt));

  return {
    filename: "participants.csv",
    content: buildCsv(
      ["email", "display_name", "role", "joined_at"],
      rows.map((row): CsvCell[] => [
        row.email,
        row.displayName,
        row.role,
        row.joinedAt,
      ]),
    ),
  };
}

export async function exportTeams(
  actor: Actor,
  eventId: string,
): Promise<CsvExport> {
  await requireExportPermission(actor, eventId);

  const rows = await db
    .select({
      teamId: schema.teams.id,
      teamName: schema.teams.name,
      memberEmail: schema.users.email,
      memberDisplayName: schema.users.displayName,
      isOwner: schema.teamMembers.isOwner,
      joinedAt: schema.teamMembers.joinedAt,
    })
    .from(schema.teams)
    .innerJoin(
      schema.teamMembers,
      and(
        eq(schema.teamMembers.teamId, schema.teams.id),
        eq(schema.teamMembers.eventId, schema.teams.eventId),
      ),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.teamMembers.userId))
    .where(eq(schema.teams.eventId, eventId))
    .orderBy(asc(schema.teams.name), asc(schema.users.displayName));

  return {
    filename: "teams.csv",
    content: buildCsv(
      ["team_id", "team_name", "member_email", "member_display_name", "is_owner", "joined_at"],
      rows.map((row): CsvCell[] => [
        row.teamId,
        row.teamName,
        row.memberEmail,
        row.memberDisplayName,
        row.isOwner,
        row.joinedAt,
      ]),
    ),
  };
}

export async function exportProjects(
  actor: Actor,
  eventId: string,
): Promise<CsvExport> {
  await requireExportPermission(actor, eventId);

  const rows = await db
    .select({
      projectId: schema.projects.id,
      slug: schema.projects.slug,
      state: schema.projects.state,
      submittedAt: schema.projects.submittedAt,
      title: schema.projectRevisions.title,
      tagline: schema.projectRevisions.tagline,
      description: schema.projectRevisions.description,
      repositoryUrl: schema.projectRevisions.repositoryUrl,
      liveUrl: schema.projectRevisions.liveUrl,
      demoVideoUrl: schema.projectRevisions.demoVideoUrl,
      techTags: schema.projectRevisions.techTags,
      teamId: schema.teams.id,
      teamName: schema.teams.name,
    })
    .from(schema.projects)
    .innerJoin(
      schema.projectRevisions,
      eq(schema.projectRevisions.id, schema.projects.currentRevisionId),
    )
    .innerJoin(schema.teams, eq(schema.teams.id, schema.projects.teamId))
    .where(eq(schema.projects.eventId, eventId))
    .orderBy(asc(schema.projects.slug));

  return {
    filename: "projects.csv",
    content: buildCsv(
      [
        "project_id",
        "slug",
        "state",
        "title",
        "tagline",
        "description",
        "repository_url",
        "live_url",
        "demo_video_url",
        "tech_tags",
        "team_id",
        "team_name",
        "submitted_at",
      ],
      rows.map((row): CsvCell[] => [
        row.projectId,
        row.slug,
        row.state,
        row.title,
        row.tagline,
        row.description,
        row.repositoryUrl,
        row.liveUrl,
        row.demoVideoUrl,
        row.techTags.join(" | "),
        row.teamId,
        row.teamName,
        row.submittedAt,
      ]),
    ),
  };
}

export async function exportJudgeAssignments(
  actor: Actor,
  eventId: string,
): Promise<CsvExport> {
  await requireExportPermission(actor, eventId);

  const rows = await db
    .select({
      assignmentId: schema.judgeAssignments.id,
      status: schema.judgeAssignments.status,
      assignedAt: schema.judgeAssignments.assignedAt,
      judgeEmail: schema.users.email,
      judgeDisplayName: schema.users.displayName,
      projectId: schema.projects.id,
      projectSlug: schema.projects.slug,
    })
    .from(schema.judgeAssignments)
    .innerJoin(schema.users, eq(schema.users.id, schema.judgeAssignments.judgeId))
    .innerJoin(
      schema.projects,
      eq(schema.projects.id, schema.judgeAssignments.projectId),
    )
    .where(eq(schema.judgeAssignments.eventId, eventId))
    .orderBy(asc(schema.judgeAssignments.assignedAt));

  return {
    filename: "judge-assignments.csv",
    content: buildCsv(
      [
        "assignment_id",
        "judge_email",
        "judge_display_name",
        "project_id",
        "project_slug",
        "status",
        "assigned_at",
      ],
      rows.map((row): CsvCell[] => [
        row.assignmentId,
        row.judgeEmail,
        row.judgeDisplayName,
        row.projectId,
        row.projectSlug,
        row.status,
        row.assignedAt,
      ]),
    ),
  };
}

export async function exportEvaluations(
  actor: Actor,
  eventId: string,
): Promise<CsvExport> {
  await requireExportPermission(actor, eventId);

  const rows = await db
    .select({
      evaluationId: schema.evaluations.id,
      assignmentId: schema.evaluations.assignmentId,
      state: schema.evaluations.state,
      judgeEmail: schema.users.email,
      judgeDisplayName: schema.users.displayName,
      projectId: schema.projects.id,
      projectSlug: schema.projects.slug,
      overallComment: schema.evaluations.overallComment,
      startedAt: schema.evaluations.startedAt,
      submittedAt: schema.evaluations.submittedAt,
      lockedAt: schema.evaluations.lockedAt,
    })
    .from(schema.evaluations)
    .innerJoin(
      schema.judgeAssignments,
      eq(schema.judgeAssignments.id, schema.evaluations.assignmentId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.judgeAssignments.judgeId))
    .innerJoin(
      schema.projects,
      eq(schema.projects.id, schema.judgeAssignments.projectId),
    )
    .where(eq(schema.judgeAssignments.eventId, eventId))
    .orderBy(asc(schema.judgeAssignments.assignedAt));

  const scoreTextByEvaluation = new Map<string, string>();
  if (rows.length > 0) {
    const scores = await db
      .select({
        evaluationId: schema.evaluationScores.evaluationId,
        criterionId: schema.evaluationScores.criterionId,
        score: schema.evaluationScores.score,
      })
      .from(schema.evaluationScores)
      .where(
        inArray(
          schema.evaluationScores.evaluationId,
          rows.map((row) => row.evaluationId),
        ),
      )
      .orderBy(asc(schema.evaluationScores.criterionId));
    for (const score of scores) {
      const existing = scoreTextByEvaluation.get(score.evaluationId) ?? "";
      const part = `${score.criterionId}=${score.score}`;
      scoreTextByEvaluation.set(
        score.evaluationId,
        existing ? `${existing} ${part}` : part,
      );
    }
  }

  return {
    filename: "evaluations.csv",
    content: buildCsv(
      [
        "evaluation_id",
        "assignment_id",
        "judge_email",
        "judge_display_name",
        "project_id",
        "project_slug",
        "state",
        "score_summary",
        "overall_comment",
        "started_at",
        "submitted_at",
        "locked_at",
      ],
      rows.map((row): CsvCell[] => [
        row.evaluationId,
        row.assignmentId,
        row.judgeEmail,
        row.judgeDisplayName,
        row.projectId,
        row.projectSlug,
        row.state,
        scoreTextByEvaluation.get(row.evaluationId) ?? "",
        row.overallComment,
        row.startedAt,
        row.submittedAt,
        row.lockedAt,
      ]),
    ),
  };
}

export async function exportResults(
  actor: Actor,
  eventId: string,
): Promise<CsvExport> {
  await requireExportPermission(actor, eventId);

  const [snapshot] = await db
    .select()
    .from(schema.rankingSnapshots)
    .where(
      and(
        eq(schema.rankingSnapshots.eventId, eventId),
        sql`${schema.rankingSnapshots.publishedAt} is not null`,
      ),
    )
    .orderBy(desc(schema.rankingSnapshots.generatedAt))
    .limit(1);
  if (!snapshot) {
    throw new DogfoodError("NOT_FOUND", "Results have not been published yet");
  }

  const ranked = (snapshot.results as {
    ranked?: Array<{
      rank: number;
      projectId: string;
      competitiveScore: number;
      displayOrder: number;
    }>;
  }).ranked ?? [];

  return {
    filename: "results.csv",
    content: buildCsv(
      ["rank", "project_id", "competitive_score", "display_order"],
      ranked.map((item): CsvCell[] => [
        item.rank,
        item.projectId,
        item.competitiveScore,
        item.displayOrder,
      ]),
    ),
  };
}

export const EXPORTS: Record<string, ExportBuilder> = {
  participants: exportParticipants,
  teams: exportTeams,
  projects: exportProjects,
  "judge-assignments": exportJudgeAssignments,
  evaluations: exportEvaluations,
  results: exportResults,
};