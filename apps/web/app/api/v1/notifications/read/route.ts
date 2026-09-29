import { markAllRead } from "@dogfood/notifications";

import { api, json, requireApiActor } from "../../../../../server/api/http";

export async function POST(request: Request): Promise<Response> {
  return api(request, async () => {
    const actor = await requireApiActor(request);
    await markAllRead(actor);
    return json({ read: true });
  });
}
