import { withdrawProject } from "@dogfood/submissions";

import { api, json, requireApiActor } from "../../../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; projectId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, projectId } = await params;
    const actor = await requireApiActor(request);
    const project = await withdrawProject(actor, eventId, projectId);
    return json({ project });
  });
}
