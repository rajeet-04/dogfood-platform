import { notFound } from "next/navigation";
import { Award, ExternalLink } from "lucide-react";
import { listCertificates } from "@dogfood/certificates";
import { CERTIFICATE_TIER_LABEL } from "@dogfood/certificates";
import { DogfoodError } from "@dogfood/validation";

import { NotAllowed } from "../../../../components/not-allowed";
import { Badge } from "../../../../components/badge";
import { requireActor } from "../../../../server/session";
import { isUuidId } from "../../../../lib/ids";
import { ButtonLink } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import { EmptyStatePanel } from "../../../../components/ui/empty-state";
import { Page, PageHeader } from "../../../../components/ui/page-header";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableWrap,
} from "../../../../components/ui/table";

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
  if (!isUuidId(eventId)) notFound();
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

  const issued = certificates.length;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: "Organizer", href: `/events/${eventId}/organizer` },
          { label: "Certificates" },
        ]}
        title="Certificates"
        description={
          issued === 0
            ? "Issue a certificate for every place on the published ranking."
            : `${issued} certificate${issued === 1 ? "" : "s"} issued. Each link is public and can be shared.`
        }
        actions={
          <ButtonLink
            href={`/events/${eventId}/organizer`}
            variant="outline"
            size="sm"
          >
            Back to organizer
          </ButtonLink>
        }
      />

      {issued === 0 ? (
        <EmptyStatePanel
          className="mt-6"
          icon="file"
          title="No certificates issued yet."
          description={
            <>
              Publish a ranking snapshot, then issue a certificate for each
              place so teams have something shareable.
            </>
          }
          action={
            <ButtonLink
              href={`/events/${eventId}/organizer`}
              variant="secondary"
              size="sm"
            >
              Issue certificates
            </ButtonLink>
          }
        />
      ) : (
        <Card className="mt-6 overflow-hidden">
          <TableWrap>
            <Table>
              <TableHead>
                <tr>
                  <TableHeader>Recipient</TableHeader>
                  <TableHeader>Project</TableHeader>
                  <TableHeader>Tier</TableHeader>
                  <TableHeader>Issued</TableHeader>
                  <TableHeader align="right">Link</TableHeader>
                </tr>
              </TableHead>
              <TableBody>
                {certificates.map((certificate) => (
                  <TableRow key={certificate.id} interactive>
                    <TableCell label="Recipient" primary>
                      {certificate.displayName}
                    </TableCell>
                    <TableCell label="Project">
                      <span className="block">{certificate.projectTitle}</span>
                      {certificate.teamName ? (
                        <span className="mt-0.5 block text-caption text-fg-subtle">
                          {certificate.teamName}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell label="Tier">
                      <Badge tone="violet" icon={<Award className="size-3" />}>
                        {CERTIFICATE_TIER_LABEL[
                          certificate.tier as keyof typeof CERTIFICATE_TIER_LABEL
                        ] ?? certificate.tier}
                        {certificate.rank ? ` · #${certificate.rank}` : ""}
                      </Badge>
                    </TableCell>
                    <TableCell label="Issued">
                      <span className="text-fg-subtle">
                        {formatDate(certificate.issuedAt)}
                      </span>
                    </TableCell>
                    <TableCell label="Link" align="right">
                      <ButtonLink
                        href={`/certificates/${certificate.id}`}
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                      >
                        View
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </ButtonLink>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableWrap>
        </Card>
      )}
    </Page>
  );
}
