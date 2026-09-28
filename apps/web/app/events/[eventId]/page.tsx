import Link from "next/link";
import { notFound } from "next/navigation";
import { and, db, eq, schema } from "@dogfood/db";

import { ActionForm } from "../../../components/action-form";
import { EVENT_STATE_LABEL } from "../../../lib/event-flow";
import { joinEventAction } from "../../../server/actions/members";
import { getActor } from "../../../server/session";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-700">{value}</dd>
    </div>
  );
}

export default async function EventLandingPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const actor = await getActor();

  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = rows[0];
  if (!event) notFound();

  let roles: string[] = [];
  if (actor) {
    const memberships = await db
      .select({ role: schema.eventMemberships.role })
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, eventId),
          eq(schema.eventMemberships.userId, actor.userId),
        ),
      );
    roles = memberships.map((m) => m.role);
  }

  const links: Array<{ label: string; href: string }> = [];
  if (roles.includes("PARTICIPANT")) {
    links.push({ label: "Participant dashboard", href: `/events/${eventId}/participant` });
  }
  if (roles.includes("JUDGE")) {
    links.push({ label: "Judge queue", href: `/events/${eventId}/judge` });
  }
  if (roles.includes("ORGANIZER") || actor?.isPlatformAdmin) {
    links.push({ label: "Organizer dashboard", href: `/events/${eventId}/organizer` });
  }

  const stateLabel = EVENT_STATE_LABEL[event.state] ?? event.state;
  const canJoin = actor && event.state === "REGISTRATION" && links.length === 0;

  return (
    <main>
      <header className="bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-4 py-16 text-white sm:py-20">
        <div className="mx-auto max-w-5xl">
          <span className="inline-block rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-100">
            {stateLabel}
          </span>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight sm:text-5xl">
            {event.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-indigo-100">/{event.slug}</p>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {event.description ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="mb-3 text-lg font-semibold">About this event</h2>
              <p className="whitespace-pre-wrap text-slate-600">
                {event.description}
              </p>
            </div>
          ) : null}

          {links.length ? (
            <section className="mt-6">
              <h2 className="mb-3 text-lg font-semibold">Your dashboard</h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 font-medium hover:border-indigo-300 hover:shadow-sm"
                    >
                      <span>{link.label}</span>
                      <span className="text-slate-400 transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!links.length && !canJoin ? (
            <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
              <p className="text-slate-500">
                {actor
                  ? `Registration for this event is ${event.state === "REGISTRATION" ? "open" : "not open right now"}.`
                  : "Sign in to join this event."}
              </p>
              {!actor && event.state === "REGISTRATION" ? (
                <Link
                  href="/login"
                  className="mt-4 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
                >
                  Sign in to join
                </Link>
              ) : null}
            </section>
          ) : null}
        </section>

        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Event details
          </h2>
          <dl className="space-y-3">
            <DetailRow label="Status" value={stateLabel} />
            <DetailRow
              label="Applications open"
              value={formatDateTime(event.registrationOpensAt)}
            />
            <DetailRow
              label="Applications close"
              value={formatDateTime(event.registrationClosesAt)}
            />
            <DetailRow
              label="Submissions close"
              value={formatDateTime(event.submissionClosesAt)}
            />
            <DetailRow label="Timezone" value={event.timezone} />
          </dl>

          <div className="mt-6">
            {links.length ? (
              <span className="inline-block rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                You are part of this event
              </span>
            ) : canJoin ? (
              <ActionForm
                action={joinEventAction.bind(null, eventId)}
                submitLabel="Join as participant"
                className="[&_button]:mt-0"
              />
            ) : (
              <p className="rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
                {actor
                  ? "Registration closed"
                  : "Sign in to apply for this event"}
              </p>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}