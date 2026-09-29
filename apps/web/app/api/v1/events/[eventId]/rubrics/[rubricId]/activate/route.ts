import { activateRubric } from "@dogfood/judging";

import { api, json, requireApiActor } from "../../../../../../../../server/api/http";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string; rubricId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, rubricId } = await params;
    const actor = await requireApiActor(request);
    const rubric = await activateRubric(actor, eventId, rubricId);
    return json({ rubric });
  });
}
