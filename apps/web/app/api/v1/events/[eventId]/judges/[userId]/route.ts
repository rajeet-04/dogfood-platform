import { deactivateJudge } from "@dogfood/applications";

import { api, json, requireApiActor } from "../../../../../../../server/api/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; userId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, userId } = await params;
    const actor = await requireApiActor(request);
    await deactivateJudge(actor, eventId, userId);
    return json({ deactivated: true });
  });
}
