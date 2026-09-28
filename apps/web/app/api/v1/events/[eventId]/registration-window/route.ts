import { updateEventRegistrationWindow } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";
import { toEventSummary } from "../../route";

const registrationWindowSchema = z.object({
  registrationOpensAt: z.string().datetime().nullable(),
  registrationClosesAt: z.string().datetime().nullable(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = registrationWindowSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const registrationOpensAt = parsed.data.registrationOpensAt
      ? new Date(parsed.data.registrationOpensAt)
      : null;
    const registrationClosesAt = parsed.data.registrationClosesAt
      ? new Date(parsed.data.registrationClosesAt)
      : null;
    const event = await updateEventRegistrationWindow(actor, eventId, {
      registrationOpensAt,
      registrationClosesAt,
    });
    return json({
      event: {
        ...toEventSummary(event),
        registrationOpensAt: event.registrationOpensAt?.toISOString() ?? null,
        registrationClosesAt: event.registrationClosesAt?.toISOString() ?? null,
      },
    });
  });
}
