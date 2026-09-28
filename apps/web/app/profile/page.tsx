import Link from "next/link";

import { Badge } from "../../components/badge";
import { Collapsible } from "../../components/collapsible";
import {
  EVENT_ROLE_TONE,
  EVENT_STATE_LABEL,
  EVENT_STATE_TONE,
} from "../../lib/event-flow";
import { requireActor } from "../../server/session";
import { getProfile } from "../../server/read-models/profile";

export const dynamic = "force-dynamic";

function roleLabel(role: string): string {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

export default async function ProfilePage() {
  const actor = await requireActor();
  const profile = await getProfile(actor);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-slate-500">Display name</dt>
            <dd className="font-medium">{profile.displayName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-slate-500">Email</dt>
            <dd className="font-medium">{profile.email}</dd>
          </div>
          {profile.isPlatformAdmin ? (
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-slate-500">Access</dt>
              <dd>
                <Badge tone="indigo">Platform admin</Badge>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Events</h2>
          {profile.memberships.length > 0 ? (
            <Badge tone="slate">{profile.memberships.length} joined</Badge>
          ) : null}
        </div>
        {profile.memberships.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">
            You are not a member of any event yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {profile.memberships.map((membership) => (
              <li
                key={membership.eventId}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <Link
                    href={`/events/${membership.eventId}`}
                    className="font-medium hover:underline"
                  >
                    {membership.eventName}
                  </Link>
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <Badge
                      tone={EVENT_STATE_TONE[membership.eventState] ?? "slate"}
                    >
                      {EVENT_STATE_LABEL[membership.eventState] ??
                        membership.eventState}
                    </Badge>
                    {membership.teamName ? `Team: ${membership.teamName}` : null}
                    {membership.isTeamLeader ? "Leader" : null}
                  </p>
                </div>
                <Badge tone={EVENT_ROLE_TONE[membership.role] ?? "slate"}>
                  {roleLabel(membership.role)}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Collapsible
        title="Certificates"
        meta={
          <Badge tone={profile.certificates.length > 0 ? "emerald" : "slate"}>
            {profile.certificates.length} earned
          </Badge>
        }
      >
        {profile.certificates.length === 0 ? (
          <p className="text-sm text-slate-500">No certificates yet.</p>
        ) : (
          <ul className="space-y-2">
            {profile.certificates.map((certificate) => (
              <li key={certificate.id}>
                <Link
                  href={`/certificates/${certificate.id}`}
                  className="text-sm font-medium text-blue-600 hover:underline"
                >
                  {certificate.eventName}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </main>
  );
}
