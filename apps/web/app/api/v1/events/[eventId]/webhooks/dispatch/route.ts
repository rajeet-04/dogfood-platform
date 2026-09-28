import { dispatchDueWebhookDeliveries } from "@dogfood/audit";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../../server/api/http";

const dispatchSchema = z.object({ limit: z.number().int().min(1).max(100).optional() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = dispatchSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    return json(await dispatchDueWebhookDeliveries(actor, eventId, parsed.data));
  });
}
