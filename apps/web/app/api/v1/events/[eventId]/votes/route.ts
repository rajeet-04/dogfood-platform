import { castVote, getVotingConfig, trustedVotingNetworkHash } from "@dogfood/voting";
import { z } from "@dogfood/validation";

import { api, getActorFromRequest, json, readJsonBody, throwValidation } from "../../../../../../server/api/http";

export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await getActorFromRequest(request);
    const parsed = z.object({ projectId: z.string().uuid() }).safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    const config = await getVotingConfig(eventId);
    const cookieName = `dogfood_vote_${eventId}`;
    const cookieToken = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(cookieName + "="))?.slice(cookieName.length + 1);
    const credential = config.accessMode === "OPEN_LINK" ? cookieToken : request.headers.get("x-voting-invitation") ?? undefined;
    const networkHash = trustedVotingNetworkHash(request.headers.get("x-real-ip") ?? undefined);
    await castVote(actor, eventId, parsed.data.projectId, credential, { networkHash });
    return json({ accepted: true }, { status: 201 });
  });
}
