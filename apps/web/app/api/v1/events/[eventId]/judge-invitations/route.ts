import { createJudgeInvitation, listJudgeInvitations } from "@dogfood/events";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../server/api/http";

const createSchema = z.object({ email: z.string().trim().email().max(320) });

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    return json({ invitations: await listJudgeInvitations(actor, eventId) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = createSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const created = await createJudgeInvitation(actor, eventId, parsed.data.email);
    return json(created, { status: 201 });
  });
}
