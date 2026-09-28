import { notFound, redirect } from "next/navigation";

import { JudgeInvitationAcceptance } from "../../../../../components/judge-invitation-acceptance";
import { getActor } from "../../../../../server/session";
import { isUuidId } from "../../../../../lib/ids";

export const dynamic = "force-dynamic";

export default async function JudgeInvitationPage({
  params,
}: {
  params: Promise<{ eventId: string; token: string }>;
}) {
  const { eventId, token } = await params;
  if (!isUuidId(eventId) || !/^[A-Za-z0-9_-]{40,64}$/.test(token)) notFound();
  const actor = await getActor();
  if (!actor) {
    const next = `/events/${eventId}/judge-invitations/${token}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return <JudgeInvitationAcceptance eventId={eventId} token={token} />;
}
