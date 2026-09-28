import { and, db, desc, eq, inArray, isNotNull, schema } from "@dogfood/db";

type StoredRankedProject = {
  rank: number;
  projectId: string;
  competitiveScore: number;
  displayOrder: number;
};

type StoredCriterionBreakdown = {
  name: string;
  meanWeightedScore: number;
  scoredBy: number;
};

export type ResultCriterion = {
  criterionId: string;
  name: string;
  meanWeightedScore: number;
  scoredBy: number;
};

export type ResultEntry = {
  rank: number;
  projectId: string;
  projectTitle: string;
  teamId: string | null;
  teamName: string | null;
  /** Normalized ranking score; the value ranks are derived from. */
  score: number;
  /** Sum of the per-criterion weighted scores, i.e. the absolute score. */
  weightedTotal: number | null;
  criteria: ResultCriterion[];
};

export type EventResults = {
  snapshotId: string;
  rankingVersion: string;
  scoringVersion: string;
  normalizationVersion: string;
  generatedAt: Date;
  publishedAt: Date | null;
  entries: ResultEntry[];
};

export function formatScore(value: number): string {
  return value.toFixed(2);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Reads the ranking snapshot for an event and joins it to projects and teams.
 * By default only published snapshots are returned; organizers pass
 * `includeUnpublished` so they can inspect a snapshot before releasing it.
 */
export async function getEventResults(
  eventId: string,
  options: { includeUnpublished?: boolean } = {},
): Promise<EventResults | null> {
  const rows = await db
    .select()
    .from(schema.rankingSnapshots)
    .where(
      options.includeUnpublished
        ? eq(schema.rankingSnapshots.eventId, eventId)
        : and(
            eq(schema.rankingSnapshots.eventId, eventId),
            isNotNull(schema.rankingSnapshots.publishedAt),
          ),
    )
    .orderBy(desc(schema.rankingSnapshots.generatedAt))
    .limit(1);

  const snapshot = rows[0];
  if (!snapshot) return null;

  const results = snapshot.results as {
    ranked?: StoredRankedProject[];
    criteria?: Record<string, Record<string, StoredCriterionBreakdown>>;
  };
  const ranked = [...(results.ranked ?? [])].sort(
    (a, b) => a.displayOrder - b.displayOrder,
  );
  const criteriaByProject = results.criteria ?? {};

  const base = {
    snapshotId: snapshot.id,
    rankingVersion: snapshot.rankingVersion,
    scoringVersion: snapshot.scoringVersion,
    normalizationVersion: snapshot.normalizationVersion,
    generatedAt: snapshot.generatedAt,
    publishedAt: snapshot.publishedAt,
  };

  if (ranked.length === 0) return { ...base, entries: [] };

  const projectRows = await db
    .select()
    .from(schema.projects)
    .where(
      inArray(
        schema.projects.id,
        ranked.map((item) => item.projectId),
      ),
    );
  const projectById = new Map(projectRows.map((project) => [project.id, project]));

  const teamIds = [...new Set(projectRows.map((project) => project.teamId))];
  const teamRows = teamIds.length
    ? await db.select().from(schema.teams).where(inArray(schema.teams.id, teamIds))
    : [];
  const teamById = new Map(teamRows.map((team) => [team.id, team]));

  const revisionIds = projectRows
    .map((project) => project.currentRevisionId)
    .filter((id): id is string => Boolean(id));
  const revisionRows = revisionIds.length
    ? await db
        .select()
        .from(schema.projectRevisions)
        .where(inArray(schema.projectRevisions.id, revisionIds))
    : [];
  const revisionById = new Map(
    revisionRows.map((revision) => [revision.id, revision]),
  );

  const entries: ResultEntry[] = ranked.map((item) => {
    const project = projectById.get(item.projectId);
    const team = project ? teamById.get(project.teamId) : undefined;
    const revision = project?.currentRevisionId
      ? revisionById.get(project.currentRevisionId)
      : undefined;
    const criteria = Object.entries(criteriaByProject[item.projectId] ?? {}).map(
      ([criterionId, criterion]) => ({
        criterionId,
        name: criterion.name,
        meanWeightedScore: round3(criterion.meanWeightedScore),
        scoredBy: criterion.scoredBy,
      }),
    );
    return {
      rank: item.rank,
      projectId: item.projectId,
      projectTitle: revision?.title ?? "(untitled project)",
      teamId: project?.teamId ?? null,
      teamName: team?.name ?? null,
      score: round3(item.competitiveScore),
      weightedTotal:
        criteria.length > 0
          ? round3(
              criteria.reduce(
                (sum, criterion) => sum + criterion.meanWeightedScore,
                0,
              ),
            )
          : null,
      criteria,
    };
  });

  return { ...base, entries };
}
