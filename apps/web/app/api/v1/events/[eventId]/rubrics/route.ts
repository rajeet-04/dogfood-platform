import { createRubric } from "@dogfood/judging";
import { z } from "@dogfood/validation";

import { getOrganizerDocument } from "../../../../../../server/read-models/organizer";
import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const createSchema = z.object({ name: z.string().trim().min(1).max(120) });

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const document = await getOrganizerDocument(actor, eventId);
    return json({ rubrics: document.rubrics });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = createSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const rubric = await createRubric(actor, eventId, parsed.data);
    return json({ rubric }, { status: 201 });
  });
}
