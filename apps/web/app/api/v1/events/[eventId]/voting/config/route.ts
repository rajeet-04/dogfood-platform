import { getVotingConfig, updateVotingConfig } from "@dogfood/voting";
import { z } from "@dogfood/validation";

import { api, json, requireApiActor, readJsonBody, throwValidation } from "../../../../../../../server/api/http";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    await requireApiActor(request);
    const config = await getVotingConfig(eventId);
    return json({ config });
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = z.object({
      accessMode: z.enum(["AUTHENTICATED", "OPEN_LINK", "EMAIL_GATED"]).default("AUTHENTICATED"),
      opensAt: z.string().datetime().nullable(),
      closesAt: z.string().datetime().nullable(),
    }).safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const config = await updateVotingConfig(actor, eventId, {
      accessMode: parsed.data.accessMode,
      opensAt: parsed.data.opensAt ? new Date(parsed.data.opensAt) : null,
      closesAt: parsed.data.closesAt ? new Date(parsed.data.closesAt) : null,
    });
    return json({ config });
  });
}
