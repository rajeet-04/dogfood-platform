import {
  issueCertificates,
  listCertificates,
} from "@dogfood/certificates";

import { api, json, requireApiActor } from "../../../../../../server/api/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const certificates = await listCertificates(actor, eventId);
    return json({
      items: certificates.map((certificate) => ({
        id: certificate.id,
        eventId: certificate.eventId,
        projectId: certificate.projectId,
        recipient: certificate.displayName,
        projectTitle: certificate.projectTitle,
        teamName: certificate.teamName,
        tier: certificate.tier,
        rank: certificate.rank,
        issuedAt: certificate.issuedAt.toISOString(),
      })),
    });
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
): Promise<Response> {
  return api(request, async () => {
    const { eventId } = await params;
    const actor = await requireApiActor(request);
    const result = await issueCertificates(actor, eventId);
    return json({ issued: result.issued, snapshotId: result.snapshotId }, {
      status: 201,
    });
  });
}