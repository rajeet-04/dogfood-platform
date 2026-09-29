import { ensureOpenLinkCredential, getVotingBallot, getVotingConfig, trustedVotingNetworkHash } from "@dogfood/voting";

import { api, getActorFromRequest, json } from "../../../../../../../server/api/http";

function cookie(request: Request, name: string): string | undefined {
  return request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(name + "="))?.slice(name.length + 1);
}

export async function GET(request: Request, { params }: { params: Promise<{ eventId: string }> }): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await getActorFromRequest(request);
    const config = await getVotingConfig(eventId);
    const invitation = request.headers.get("x-voting-invitation") ?? undefined;
    if (config.accessMode === "OPEN_LINK") {
      const cookieName = `dogfood_vote_${eventId}`;
      const credential = await ensureOpenLinkCredential(eventId, cookie(request, cookieName), {
        networkHash: trustedVotingNetworkHash(request.headers.get("x-real-ip") ?? undefined),
      });
      const response = json({ ballot: await getVotingBallot(actor, eventId, credential.token) });
      response.headers.append("Set-Cookie", `${cookieName}=${credential.token}; Path=/api/v1/events/${eventId}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((credential.expiresAt.getTime() - Date.now()) / 1000))}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
      return response;
    }
    return json({ ballot: await getVotingBallot(actor, eventId, invitation) });
  });
}
