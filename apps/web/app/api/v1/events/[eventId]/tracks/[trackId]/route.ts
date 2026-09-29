import { listEventTracks, removeEventTrack, updateEventTrack } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const trackSchema = z.object({ name: z.string().trim().min(1).max(100) });

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string; trackId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, trackId } = await params;
    const actor = await requireApiActor(request);
    const parsed = trackSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    await updateEventTrack(actor, eventId, trackId, parsed.data.name);
    const tracks = await listEventTracks(actor, eventId);
    return json({ track: tracks.find((track) => track.id === trackId) });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; trackId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, trackId } = await params;
    const actor = await requireApiActor(request);
    await removeEventTrack(actor, eventId, trackId);
    return json({ deleted: true });
  });
}
