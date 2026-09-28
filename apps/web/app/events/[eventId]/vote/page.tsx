import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db, eq, schema } from "@dogfood/db";

import { Badge } from "../../../../components/badge";
import { CommunityBallot } from "../../../../components/voting/community-ballot";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../../../lib/event-flow";
import { isUuidId } from "../../../../lib/ids";
import { Page, PageHeader } from "../../../../components/ui/page-header";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventId: string }>;
}): Promise<Metadata> {
  const { eventId } = await params;
  if (!isUuidId(eventId)) return { title: "Community vote" };
  const [event] = await db
    .select({ name: schema.events.name })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  return { title: event ? "Vote · " + event.name : "Community vote" };
}

export default async function EventVotePage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId: eventParam } = await params;
  const isUuid = isUuidId(eventParam);
  const [event] = await db
    .select({
      id: schema.events.id,
      name: schema.events.name,
      state: schema.events.state,
    })
    .from(schema.events)
    .where(isUuid ? eq(schema.events.id, eventParam) : eq(schema.events.slug, eventParam))
    .limit(1);
  if (!event) notFound();

  return (
    <Page width="narrow">
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: event.name, href: "/events/" + event.id },
          { label: "Community vote" },
        ]}
        title="Cast your vote"
        description={"Choose one submitted project in " + event.name + "."}
        meta={<Badge tone={EVENT_STATE_TONE[event.state]}>{EVENT_STATE_LABEL[event.state]}</Badge>}
        className="mb-7"
      />
      <CommunityBallot eventId={event.id} />
    </Page>
  );
}
