import { notFound } from "next/navigation";
import { listWebhookDeliveries, listWebhookEndpoints } from "@dogfood/audit";
import { DogfoodError } from "@dogfood/validation";

import { NotAllowed } from "../../../../../components/not-allowed";
import { ButtonLink } from "../../../../../components/ui/button";
import { Page, PageHeader } from "../../../../../components/ui/page-header";
import { isUuidId } from "../../../../../lib/ids";
import { requireActor } from "../../../../../server/session";
import { WebhookSettings } from "../../../../../components/organizer/webhook-settings";

export const dynamic = "force-dynamic";

export default async function OrganizerWebhooksPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!isUuidId(eventId)) notFound();
  const actor = await requireActor();

  try {
    const [endpoints, deliveries] = await Promise.all([
      listWebhookEndpoints(actor, eventId),
      listWebhookDeliveries(actor, eventId),
    ]);
    return (
      <Page width="narrow">
        <PageHeader
          breadcrumbs={[
            { label: "Events", href: "/events" },
            { label: "Organizer", href: `/events/${eventId}/organizer` },
            { label: "Webhooks" },
          ]}
          title="Event webhooks"
          description="Send signed notifications for audited event actions to your integrations."
          actions={<ButtonLink href={`/events/${eventId}/organizer`} variant="outline">Organizer dashboard</ButtonLink>}
        />
        <WebhookSettings
          eventId={eventId}
          initialEndpoints={endpoints.map((endpoint) => ({ ...endpoint, createdAt: endpoint.createdAt.toISOString() }))}
          initialDeliveries={deliveries.map((delivery) => ({ ...delivery, createdAt: delivery.createdAt.toISOString() }))}
        />
      </Page>
    );
  } catch (error) {
    if (error instanceof DogfoodError) {
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "FORBIDDEN") {
        return <NotAllowed message={error.message} backHref={`/events/${eventId}`} />;
      }
    }
    throw error;
  }
}
