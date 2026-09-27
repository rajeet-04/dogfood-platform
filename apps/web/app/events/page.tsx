import Link from "next/link";
import { db, desc, schema } from "@dogfood/db";

import { EVENT_STATE_LABEL } from "../../lib/event-flow";
import { getActor } from "../../server/session";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  const events = await db
    .select()
    .from(schema.events)
    .orderBy(desc(schema.events.createdAt));
  const actor = await getActor();

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        {actor ? (
          <Link
            href="/events/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            New event
          </Link>
        ) : null}
      </div>
      {events.length === 0 ? (
        <p className="text-slate-500">No events yet.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {events.map((event) => (
            <li key={event.id}>
              <Link
                href={`/events/${event.id}`}
                className="block rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300"
              >
                <h2 className="font-semibold">{event.name}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {event.description || event.slug}
                </p>
                <span className="mt-3 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {EVENT_STATE_LABEL[event.state] ?? event.state}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}