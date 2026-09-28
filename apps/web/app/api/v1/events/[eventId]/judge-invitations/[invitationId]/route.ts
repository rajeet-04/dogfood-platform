import { revokeJudgeInvitation } from "@dogfood/events";

import { api, json, requireApiActor } from "../../../../../../../server/api/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; invitationId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, invitationId } = await params;
    const actor = await requireApiActor(request);
    return json({ invitation: await revokeJudgeInvitation(actor, eventId, invitationId) });
  });
}
