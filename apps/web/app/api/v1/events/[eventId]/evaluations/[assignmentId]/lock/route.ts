import { lockEvaluation } from "@dogfood/judging";

import { api, json, requireApiActor } from "../../../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; assignmentId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, assignmentId } = await params;
    const actor = await requireApiActor(request);
    const evaluation = await lockEvaluation(actor, eventId, assignmentId);
    return json({ evaluation });
  });
}
