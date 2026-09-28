import { unassignJudge } from "@dogfood/judging";

import { api, requireApiActor } from "../../../../../../../server/api/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; assignmentId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, assignmentId } = await params;
    const actor = await requireApiActor(request);
    await unassignJudge(actor, eventId, assignmentId);
    return new Response(null, { status: 204 });
  });
}
