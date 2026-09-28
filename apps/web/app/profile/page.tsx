import Link from "next/link";

import { EVENT_STATE_LABEL } from "../../lib/event-flow";
import { requireActor } from "../../server/session";
import { getProfile } from "../../server/read-models/profile";

export const dynamic = "force-dynamic";

const ROLE_PILL: Record<string, string> = {
  PARTICIPANT: "bg-sky-50 text-sky-700",
  JUDGE: "bg-indigo-50 text-indigo-700",
  ORGANIZER: "bg-violet-50 text-violet-700",
};

export default async function ProfilePage() {
  const actor = await requireActor();
  const profile = await getProfile(actor);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold">Profile</h1>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex gap-2">
            <dt className="w-28 text-slate-500">Display name</dt>
            <dd className="font-medium">{profile.displayName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 text-slate-500">Email</dt>
            <dd className="font-medium">{profile.email}</dd>
          </div>
          {profile.isPlatformAdmin ? (
            <div className="flex gap-2">
              <dt className="w-28 text-slate-500">Access</dt>
              <dd>
                <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                  Platform admin
                </span>
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Events</h2>
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
                <div>
                  <Link
                    href={`/events/${membership.eventId}`}
                    className="font-medium hover:underline"
                  >
                    {membership.eventName}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {EVENT_STATE_LABEL[membership.eventState] ??
                      membership.eventState}
                    {membership.teamName ? ` · Team: ${membership.teamName}` : ""}
                    {membership.isTeamLeader ? " · Leader" : ""}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    ROLE_PILL[membership.role] ?? "bg-slate-100 text-slate-600"
                  }`}
                >
                  {membership.role.charAt(0) + membership.role.slice(1).toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Certificates</h2>
        {profile.certificates.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No certificates yet.</p>
        ) : (
          <ul className="mt-4 space-y-2">
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
      </section>
    </main>
  );
}
