import { getVotingResults } from "@dogfood/voting";

import { api, json, requireApiActor } from "../../../../../../../server/api/http";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    return json(await getVotingResults(actor, eventId));
  });
}
