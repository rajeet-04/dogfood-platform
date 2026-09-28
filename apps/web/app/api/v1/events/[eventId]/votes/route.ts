import { castVote } from "@dogfood/voting";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = z.object({ projectId: z.string().uuid() }).safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    await castVote(actor, eventId, parsed.data.projectId);
    return json({ accepted: true }, { status: 201 });
  });
}
