import Link from "next/link";
import { notFound } from "next/navigation";
import { and, db, eq, schema } from "@dogfood/db";

import { EVENT_STATE_LABEL } from "../../../lib/event-flow";
import { getActor } from "../../../server/session";

export const dynamic = "force-dynamic";

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-6">
        <p className="text-sm text-slate-500">{event.slug}</p>
        <h1 className="text-3xl font-bold">{event.name}</h1>
        {event.description ? (
          <p className="mt-2 text-slate-600">{event.description}</p>
        ) : null}
        <span className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
          {EVENT_STATE_LABEL[event.state] ?? event.state}
        </span>
      </div>
      {links.length ? (
        <ul className="grid gap-3">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="block rounded-lg border border-slate-200 bg-white px-5 py-4 font-medium hover:border-slate-300"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500">
          You are not part of this event yet.
        </p>
      )}
    </main>
  );
}