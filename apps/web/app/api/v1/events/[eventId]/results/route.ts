import { and, db, desc, eq, schema, sql } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

import { api, json } from "../../../../../../server/api/http";

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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

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

    const ranked = (snapshot.results as { ranked?: StoredRankedProject[] }).ranked ?? [];
    const criteriaByProject =
      (snapshot.results as {
        criteria?: Record<string, Record<string, StoredCriterionBreakdown>>;
      }).criteria ?? {};

    return json({
      results: {
        snapshotId: snapshot.id,
        publishedAt: new Date(snapshot.publishedAt!).toISOString(),
        rankings: ranked.map((item) => ({
          rank: item.rank,
          projectId: item.projectId,
          competitiveScore: item.competitiveScore,
          criteria: Object.entries(
            criteriaByProject[item.projectId] ?? {},
          ).map(([criterionId, criterion]) => ({
            criterionId,
            name: criterion.name,
            meanWeightedScore: round3(criterion.meanWeightedScore),
            scoredBy: criterion.scoredBy,
          })),
        })),
      },
    });
  });
}