import { createVotingInvitation, listVotingInvitations } from "@dogfood/voting";
import { z } from "@dogfood/validation";

import { api, json, readJsonBody, requireApiActor, throwValidation } from "../../../../../../../server/api/http";

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    return json({ invitations: await listVotingInvitations(await requireApiActor(request), eventId) });
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const parsed = z.object({ email: z.string().trim().min(1).max(320) }).safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const result = await createVotingInvitation(actor, eventId, parsed.data.email);
    return json({ invitation: result.invitation, token: result.token }, { status: 201 });
  });
}
