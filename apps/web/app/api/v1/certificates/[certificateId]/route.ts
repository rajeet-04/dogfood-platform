import { getCertificate } from "@dogfood/certificates";

import { api, json } from "../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ certificateId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { certificateId } = await params;
    const certificate = await getCertificate(certificateId);
    return json({
      certificate: {
        id: certificate.id,
        eventId: certificate.eventId,
        eventName: certificate.eventName,
        eventSlug: certificate.eventSlug,
        projectTitle: certificate.projectTitle,
        teamName: certificate.teamName,
        recipient: certificate.displayName,
        tier: certificate.tier,
        rank: certificate.rank,
        issuedAt: certificate.issuedAt.toISOString(),
      },
    });
  });
}