import { createPrize, listEventPrizes } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const prizeSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  trackId: z.string().uuid().nullable().optional(),
  amount: z.string().trim().max(32).nullable().optional(),
  currency: z.string().trim().max(3).nullable().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    return json({ prizes: await listEventPrizes(eventId) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = prizeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const prize = await createPrize(actor, eventId, parsed.data);
    return json({ prize }, { status: 201 });
  });
}
