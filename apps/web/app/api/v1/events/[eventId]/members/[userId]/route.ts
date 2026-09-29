import { grantEventMembership, removeEventMembership } from "@dogfood/events";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../../server/api/http";

const roleSchema = z.object({
  role: z.enum(["PARTICIPANT", "JUDGE", "ORGANIZER"]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string; userId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, userId } = await params;
    const actor = await requireApiActor(request);
    const parsed = roleSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const membership = await grantEventMembership(actor, eventId, userId, parsed.data.role);
    return json({ membership });
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; userId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, userId } = await params;
    const actor = await requireApiActor(request);
    await removeEventMembership(actor, eventId, userId);
    return json({ removed: true });
  });
}
