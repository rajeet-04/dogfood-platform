import { queryAudit } from "@dogfood/audit";

import { api, json, requireApiActor } from "../../../../../../../server/api/http";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const batches = await Promise.all(["voting_config", "voting_invitation", "vote", "project_comment", "comment"].map((resourceType) =>
      queryAudit(actor, eventId, { limit: 100, resourceType }),
    ));
    const events = batches.flat().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 100);
    return json({ events });
  });
}
