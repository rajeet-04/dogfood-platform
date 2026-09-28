import { EVENT_STATES, type EventState } from "@dogfood/db";
import { transitionEvent } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";
import { toEventSummary } from "../../route";

const transitionSchema = z.object({
  toState: z.enum(EVENT_STATES as unknown as [EventState, ...EventState[]]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = transitionSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const event = await transitionEvent(actor, eventId, parsed.data.toState);
    return json({ event: toEventSummary(event) });
  });
}
