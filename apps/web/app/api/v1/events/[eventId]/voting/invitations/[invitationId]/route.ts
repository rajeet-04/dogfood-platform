import { revokeVotingInvitation } from "@dogfood/voting";

import { api, requireApiActor } from "../../../../../../../../server/api/http";

export async function DELETE(request: Request, { params }: { params: Promise<{ eventId: string; invitationId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId, invitationId } = await params;
    await revokeVotingInvitation(await requireApiActor(request), eventId, invitationId);
    return new Response(null, { status: 204 });
  });
}
