import {
  createWebhookEndpoint,
  listWebhookDeliveries,
  listWebhookEndpoints,
} from "@dogfood/audit";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../server/api/http";

const createSchema = z.object({
  url: z.string().min(1).max(2048),
  eventTypes: z.array(z.string().min(1).max(96)).min(1).max(64).default(["*"]),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const [endpoints, deliveries] = await Promise.all([
      listWebhookEndpoints(actor, eventId),
      listWebhookDeliveries(actor, eventId),
    ]);
    return json({ endpoints, deliveries });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = createSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const result = await createWebhookEndpoint(actor, eventId, parsed.data);
    return json(result, { status: 201 });
  });
}
