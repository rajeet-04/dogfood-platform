import { notFound } from "next/navigation";
import { Award } from "lucide-react";
import { getCertificate } from "@dogfood/certificates";
import { CERTIFICATE_TIER_LABEL } from "@dogfood/certificates";
import { DogfoodError } from "@dogfood/validation";

import { ButtonLink } from "../../../components/ui/button";
import { isUuidId } from "../../../lib/ids";
import {
  Breadcrumbs,
  Page,
} from "../../../components/ui/page-header";

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
  if (!isUuidId(certificateId)) notFound();

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
    <Page width="narrow" className="flex flex-col items-center">
      <Breadcrumbs
        className="w-full self-stretch"
        items={[
          { label: "Events", href: "/events" },
          { label: certificate.eventName, href: `/events/${certificate.eventId}` },
          { label: "Certificate" },
        ]}
      />

      <div
        data-testid="certificate-card"
        className="mt-6 w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
      >
        <div className="bg-award-band flex flex-col items-center gap-2 px-6 py-10 text-center sm:px-10">
          <Award className="size-7 text-accent-fg/85" aria-hidden="true" />
          <p className="text-micro font-semibold tracking-[0.18em] text-accent-fg/85 uppercase">
            Certificate of achievement
          </p>
          <p className="text-subheading font-semibold text-balance text-accent-fg">
            {certificate.eventName}
          </p>
        </div>

        <div className="px-6 py-10 text-center sm:px-10 sm:py-12">
          <p className="text-small text-fg-subtle">This certifies that</p>
          <h1
            data-testid="certificate-recipient"
            className="mt-3 text-title font-semibold text-balance text-fg"
          >
            {certificate.displayName}
          </h1>
          <p className="mt-3 text-small text-fg-muted">
            {tierLabel}
            {certificate.rank ? ` — placed #${certificate.rank}` : ""} in the
            hackathon
            <span className="font-medium text-fg">
              {" "}
              “{certificate.eventName}”
            </span>
          </p>
          {certificate.projectTitle ? (
            <p className="mt-4 text-small text-fg-muted">
              with the project{" "}
              <span className="font-medium text-fg">
                “{certificate.projectTitle}”
              </span>
              {certificate.teamName ? ` from ${certificate.teamName}` : ""}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t border-line-subtle bg-surface-sunken/60 px-6 py-4 text-caption text-fg-subtle">
          <span className="tabular">
            Serial {certificate.id.slice(0, 8).toUpperCase()}
          </span>
          <span>Issued {formatDate(certificate.issuedAt)}</span>
        </div>
      </div>

      <div className="mt-6">
        <ButtonLink
          href={`/events/${certificate.eventId}`}
          variant="outline"
          size="sm"
        >
          Open event
        </ButtonLink>
      </div>
    </Page>
  );
}
