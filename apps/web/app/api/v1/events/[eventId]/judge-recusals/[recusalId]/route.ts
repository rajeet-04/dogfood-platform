import { deleteJudgeRecusal } from "@dogfood/judging";

import { api, json, requireApiActor } from "../../../../../../../server/api/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; recusalId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, recusalId } = await params;
    const actor = await requireApiActor(request);
    await deleteJudgeRecusal(actor, eventId, recusalId);
    return json({ deleted: true });
  });
}
