import { listEventTracks, moveEventTrack } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../../server/api/http";

const directionSchema = z.object({ direction: z.enum(["UP", "DOWN"]) });

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string; trackId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, trackId } = await params;
    const actor = await requireApiActor(request);
    const parsed = directionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    await moveEventTrack(actor, eventId, trackId, parsed.data.direction);
    return json({ tracks: await listEventTracks(actor, eventId) });
  });
}
