import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DogfoodError } from "@dogfood/validation";

import { NotAllowed } from "../../../../../components/not-allowed";
import { Card, CardBody, CardHeader } from "../../../../../components/ui/card";
import { Page, PageHeader } from "../../../../../components/ui/page-header";
import { isUuidId } from "../../../../../lib/ids";
import { requireActor } from "../../../../../server/session";
import { getJudgeHome } from "../../../../../server/read-models/judge";
import { PairwisePanel } from "../../../../../components/judge/pairwise-panel";

export const dynamic = "force-dynamic";

export default async function JudgePairwisePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!isUuidId(eventId)) notFound();
  const actor = await requireActor();
  let home;
  try {
    home = await getJudgeHome(actor, eventId);
  } catch (error) {
    if (error instanceof DogfoodError) {
      if (error.code === "NOT_FOUND") notFound();
      if (error.code === "FORBIDDEN") return <NotAllowed message={error.message} backHref={`/events/${eventId}`} />;
    }
    throw error;
  }

  return (
    <Page width="narrow">
      <Link href={`/events/${eventId}/judge`} className="mb-3 inline-flex items-center gap-1.5 rounded-xs text-small font-medium text-fg-subtle transition-colors hover:text-fg">
        <ArrowLeft aria-hidden="true" className="size-3.5" /> Back to queue
      </Link>
      <PageHeader title="Pairwise comparison" description={`Additional tie-break input for ${home.event.name}.`} />
      <Card className="mt-6">
        <CardHeader title="Which project is stronger?" description="Only projects assigned to you are shown. You can change a saved choice while judging is open." />
        <CardBody><PairwisePanel eventId={eventId} /></CardBody>
      </Card>
    </Page>
  );
}
