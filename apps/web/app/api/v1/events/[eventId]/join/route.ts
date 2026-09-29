import { joinEvent } from "@dogfood/events";

import { api, json, requireApiActor } from "../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const membership = await joinEvent(actor, eventId);
    return json({ membership });
  });
}
