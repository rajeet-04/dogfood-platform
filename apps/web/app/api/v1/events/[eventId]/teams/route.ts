import { createTeam } from "@dogfood/teams";
import { z } from "@dogfood/validation";

import {
  api,
  json,
  readJsonBody,
  requireApiActor,
  throwValidation,
} from "../../../../../../server/api/http";

const createTeamSchema = z.object({
  name: z.string().min(1).max(80),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;

    const actor = await requireApiActor(request);
    const body = await readJsonBody(request);
    const parsed = createTeamSchema.safeParse(body);
    if (!parsed.success) throwValidation(parsed.error.issues);

    const team = await createTeam(actor, eventId, { name: parsed.data.name });
    return json({ team }, { status: 201 });
  });
}