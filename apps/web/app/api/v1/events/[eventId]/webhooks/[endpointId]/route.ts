import {
  deleteWebhookEndpoint,
  updateWebhookEndpoint,
} from "@dogfood/audit";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../../server/api/http";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  rotateSecret: z.boolean().optional(),
}).refine((value) => value.enabled !== undefined || value.rotateSecret === true, {
  message: "Provide enabled or rotateSecret",
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string; endpointId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, endpointId } = await params;
    const actor = await requireApiActor(request);
    const parsed = updateSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    return json(await updateWebhookEndpoint(actor, eventId, endpointId, parsed.data));
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string; endpointId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, endpointId } = await params;
    const actor = await requireApiActor(request);
    await deleteWebhookEndpoint(actor, eventId, endpointId);
    return json({ deleted: true });
  });
}
