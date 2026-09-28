import { and, db, desc, eq, isNotNull, schema } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

import { api, json } from "../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const [snapshot] = await db.select().from(schema.pairwiseRankingSnapshots).where(and(
      eq(schema.pairwiseRankingSnapshots.eventId, eventId),
      isNotNull(schema.pairwiseRankingSnapshots.publishedAt),
    )).orderBy(desc(schema.pairwiseRankingSnapshots.publishedAt)).limit(1);
    if (!snapshot) throw new DogfoodError("NOT_FOUND", "Pairwise results have not been published yet");
    return json({
      results: {
        snapshotId: snapshot.id,
        publishedAt: snapshot.publishedAt!.toISOString(),
        algorithmVersion: snapshot.algorithmVersion,
        rankings: (snapshot.results as { ranked: unknown[] }).ranked,
      },
    });
  });
}
