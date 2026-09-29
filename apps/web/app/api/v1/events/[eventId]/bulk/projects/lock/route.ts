import { lockAllProjects } from "@dogfood/submissions";

import { api, json, requireApiActor } from "../../../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const locked = await lockAllProjects(actor, eventId);
    return json({ locked });
  });
}
