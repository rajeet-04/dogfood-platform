import Link from "next/link";
import { notFound } from "next/navigation";
import { getCertificate } from "@dogfood/certificates";
import { CERTIFICATE_TIER_LABEL } from "@dogfood/certificates";
import { DogfoodError } from "@dogfood/validation";

export const dynamic = "force-dynamic";

function formatDate(value: Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ certificateId: string }>;
}) {
  const { certificateId } = await params;

  let certificate;
  try {
    certificate = await getCertificate(certificateId);
  } catch (err) {
    if (err instanceof DogfoodError && err.code === "NOT_FOUND") notFound();
    throw err;
  }

  const tierLabel =
    CERTIFICATE_TIER_LABEL[
      certificate.tier as keyof typeof CERTIFICATE_TIER_LABEL
    ] ?? certificate.tier;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div
        data-testid="certificate-card"
        className="rounded-2xl border border-slate-200 bg-white p-10 shadow-sm"
      >
        <div className="border-b border-slate-100 pb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Certificate of achievement
          </p>
          <h1 className="mt-2 text-2xl font-semibold">{certificate.eventName}</h1>
        </div>

        <div className="py-10 text-center">
          <p className="text-sm text-slate-500">This certifies that</p>
          <p
            data-testid="certificate-recipient"
            className="mt-3 text-3xl font-semibold text-slate-900"
          >
            {certificate.displayName}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {tierLabel}
            {certificate.rank ? ` — placed #${certificate.rank}` : ""} in the
            hackathon
            <span className="font-medium text-slate-700">
              {" "}
              “{certificate.eventName}”
            </span>
          </p>
          {certificate.projectTitle ? (
            <p className="mt-4 text-sm text-slate-600">
              with the project{" "}
              <span className="font-medium text-slate-800">
                “{certificate.projectTitle}”
              </span>
              {certificate.teamName ? ` from ${certificate.teamName}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 pt-6 text-xs text-slate-400">
          <span>Serial {certificate.id.slice(0, 8).toUpperCase()}</span>
          <span>Issued {formatDate(certificate.issuedAt)}</span>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link
          href={`/events/${certificate.eventId}`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Open event
        </Link>
      </div>
    </main>
  );
}