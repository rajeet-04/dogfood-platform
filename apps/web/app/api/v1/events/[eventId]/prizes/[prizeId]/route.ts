import { deletePrize, updatePrize } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  trackId: z.string().uuid().nullable().optional(),
  amount: z.string().trim().max(32).nullable().optional(),
  currency: z.string().trim().max(3).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
}).refine((body) => Object.keys(body).length > 0, "Provide at least one field");

export async function PATCH(request: Request, { params }: { params: Promise<{ eventId: string; prizeId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, prizeId } = await params;
    const actor = await requireApiActor(request);
    const parsed = patchSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    return json({ prize: await updatePrize(actor, eventId, prizeId, parsed.data) });
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; prizeId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, prizeId } = await params;
    const actor = await requireApiActor(request);
    await deletePrize(actor, eventId, prizeId);
    return new Response(null, { status: 204 });
  });
}
