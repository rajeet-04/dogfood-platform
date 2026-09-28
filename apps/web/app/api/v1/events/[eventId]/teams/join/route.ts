import { joinTeam } from "@dogfood/teams";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

const joinSchema = z.object({ inviteCode: z.string().min(4).max(32) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = joinSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const team = await joinTeam(actor, eventId, parsed.data.inviteCode);
    return json({ team });
  });
}
