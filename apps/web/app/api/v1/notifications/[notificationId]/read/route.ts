import { markRead } from "@dogfood/notifications";

import { api, json, requireApiActor } from "../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { notificationId } = await params;
    const actor = await requireApiActor(request);
    await markRead(actor, notificationId);
    return json({ read: true });
  });
}
