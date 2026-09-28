import Link from "next/link";
import { notFound } from "next/navigation";
import { listCertificates } from "@dogfood/certificates";
import { CERTIFICATE_TIER_LABEL } from "@dogfood/certificates";
import { DogfoodError } from "@dogfood/validation";

import { NotAllowed } from "../../../../components/not-allowed";
import { Badge } from "../../../../components/badge";
import { requireActor } from "../../../../server/session";

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString();
}

export default async function EventCertificatesPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const actor = await requireActor();

  let certificates;
  try {
    certificates = await listCertificates(actor, eventId);
  } catch (err) {
    if (err instanceof DogfoodError) {
      if (err.code === "NOT_FOUND") notFound();
      if (err.code === "FORBIDDEN") {
        return (
          <NotAllowed
            message={err.message}
            backHref={`/events/${eventId}`}
          />
        );
      }
    }
    throw err;
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Certificates</h1>
          <p className="mt-1 text-sm text-slate-500">
            {certificates.length} certificate
            {certificates.length === 1 ? "" : "s"} issued.
          </p>
        </div>
        <Link
          href={`/events/${eventId}/organizer`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Back to organizer
        </Link>
      </div>

      {certificates.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No certificates issued yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-4 py-3 font-medium">Recipient</th>
                <th className="px-4 py-3 font-medium">Project</th>
                <th className="px-4 py-3 font-medium">Tier</th>
                <th className="px-4 py-3 font-medium">Issued</th>
                <th className="px-4 py-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {certificates.map((certificate) => (
                <tr key={certificate.id} className="border-b last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {certificate.displayName}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {certificate.projectTitle}
                    {certificate.teamName
                      ? ` · ${certificate.teamName}`
                      : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone="violet">
                      {CERTIFICATE_TIER_LABEL[
                        certificate.tier as keyof typeof CERTIFICATE_TIER_LABEL
                      ] ?? certificate.tier}
                      {certificate.rank ? ` · #${certificate.rank}` : ""}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(certificate.issuedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/certificates/${certificate.id}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
