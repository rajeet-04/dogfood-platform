import { createTeamInvite, getTeam } from "@dogfood/teams";
import { DogfoodError } from "@dogfood/validation";

import { api, json, requireApiActor } from "../../../../../../../../server/api/http";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string; teamId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId, teamId } = await params;
    const actor = await requireApiActor(request);
    const team = await getTeam(actor, teamId);
    if (team.eventId !== eventId) throw new DogfoodError("NOT_FOUND", "Team not found");
    const invitation = await createTeamInvite(actor, teamId, {});
    return json({ inviteCode: invitation.rawToken }, { status: 201 });
  });
}
