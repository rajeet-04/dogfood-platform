import { deleteProjectComment } from "@dogfood/voting";

import { api, json, requireApiActor } from "../../../../../../../../../server/api/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; projectId: string; commentId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, projectId, commentId } = await params;
    const actor = await requireApiActor(request);
    await deleteProjectComment(actor, eventId, projectId, commentId);
    return json({ deleted: true });
  });
}
