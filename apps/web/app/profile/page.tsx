import Link from "next/link";
import { Award, Mail, ShieldCheck, Users } from "lucide-react";

import { Avatar } from "../../components/ui/avatar";
import { Badge } from "../../components/badge";
import { Collapsible } from "../../components/collapsible";
import {
  EVENT_ROLE_TONE,
  EVENT_STATE_LABEL,
  EVENT_STATE_TONE,
} from "../../lib/event-flow";
import { requireActor } from "../../server/session";
import { getProfile } from "../../server/read-models/profile";
import { ButtonLink } from "../../components/ui/button";
import { Card, CardBody, CardHeader } from "../../components/ui/card";
import { EmptyStatePanel } from "../../components/ui/empty-state";
import { Page, PageHeader } from "../../components/ui/page-header";

export const dynamic = "force-dynamic";

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default async function ProfilePage() {
  const actor = await requireActor();
  const profile = await getProfile(actor);
  const memberships = profile.memberships;

  return (
    <Page width="narrow">
      <PageHeader
        title="Profile"
        description="Your account, the events you belong to, and the certificates you have earned."
        actions={
          <ButtonLink href="/events" variant="outline" size="sm">
            Browse events
          </ButtonLink>
        }
      />

      <Card className="mt-6">
        <CardBody className="flex flex-wrap items-center gap-4">
          <Avatar name={profile.displayName} size="xl" />
          <div className="min-w-0 flex-1">
            <p className="text-subheading font-semibold text-fg">
              {profile.displayName}
            </p>
            <p className="mt-0.5 flex items-center gap-1.5 text-small text-fg-subtle">
              <Mail className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="break-all">{profile.email}</span>
            </p>
          </div>
          {profile.isPlatformAdmin ? (
            <Badge tone="accent" icon={<ShieldCheck className="size-3" />}>
              Platform admin
            </Badge>
          ) : null}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Events"
          description="Every event you are a member of, and the role you hold there."
          action={
            memberships.length > 0 ? (
              <Badge tone="neutral">{memberships.length} joined</Badge>
            ) : null
          }
        />
        {memberships.length === 0 ? (
          <CardBody>
            <EmptyStatePanel
              compact
              icon="calendar"
              title="You are not a member of any event yet."
              description="Join an open event to create a team, submit a project, or help judge."
              action={
                <ButtonLink href="/events" variant="secondary" size="sm">
                  Browse events
                </ButtonLink>
              }
            />
          </CardBody>
        ) : (
          <ul className="divide-y divide-line-subtle">
            {memberships.map((membership) => (
              <li
                key={membership.eventId}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/events/${membership.eventId}`}
                    className="inline-block py-1 text-small font-medium text-fg underline-offset-4 hover:text-accent hover:underline"
                  >
                    {membership.eventName}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-fg-subtle">
                    <Badge
                      tone={EVENT_STATE_TONE[membership.eventState] ?? "neutral"}
                    >
                      {EVENT_STATE_LABEL[membership.eventState] ??
                        membership.eventState}
                    </Badge>
                    {membership.teamName ? (
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" aria-hidden="true" />
                        Team: {membership.teamName}
                      </span>
                    ) : null}
                    {membership.isTeamLeader ? (
                      <Badge tone="info">Leader</Badge>
                    ) : null}
                  </p>
                </div>
                <Badge tone={EVENT_ROLE_TONE[membership.role] ?? "neutral"}>
                  {roleLabel(membership.role)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Collapsible
        className="mt-4"
        title="Certificates"
        meta={
          <Badge
            tone={profile.certificates.length > 0 ? "success" : "neutral"}
            icon={<Award className="size-3" />}
          >
            {profile.certificates.length} earned
          </Badge>
        }
      >
        {profile.certificates.length === 0 ? (
          <p className="text-small text-fg-subtle">
            No certificates yet. Place in a published ranking to earn one.
          </p>
        ) : (
          <ul className="space-y-2">
            {profile.certificates.map((certificate) => (
              <li key={certificate.id}>
                <Link
                  href={`/certificates/${certificate.id}`}
                  className="inline-block py-1 text-small font-medium text-accent underline-offset-4 hover:underline"
                >
                  {certificate.eventName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </Page>
  );
}
