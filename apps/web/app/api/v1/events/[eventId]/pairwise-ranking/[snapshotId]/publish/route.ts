import { publishPairwiseRankingSnapshot } from "@dogfood/ranking";

import { api, json, requireApiActor } from "../../../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; snapshotId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, snapshotId } = await params;
    const actor = await requireApiActor(request);
    return json({ publication: await publishPairwiseRankingSnapshot(actor, eventId, snapshotId) });
  });
}
