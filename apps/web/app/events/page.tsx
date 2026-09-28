import Link from "next/link";
import { EVENT_STATES } from "@dogfood/db";
import { listEvents } from "@dogfood/events";

import { EVENT_STATE_LABEL } from "../../lib/event-flow";
import { getActor } from "../../server/session";

export const dynamic = "force-dynamic";

const STATE_PILL: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  REGISTRATION: "bg-emerald-50 text-emerald-700",
  SUBMISSIONS_OPEN: "bg-sky-50 text-sky-700",
  SUBMISSIONS_CLOSED: "bg-blue-50 text-blue-700",
  JUDGING: "bg-indigo-50 text-indigo-700",
  RESULTS_READY: "bg-violet-50 text-violet-700",
  PUBLISHED: "bg-emerald-100 text-emerald-800",
  ARCHIVED: "bg-slate-200 text-slate-600",
};

const FILTERABLE_STATES: readonly string[] = EVENT_STATES.filter(
  (state) => state !== "DRAFT" && state !== "ARCHIVED",
);

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  const state = params.state ?? "";
  const hasFilters = Boolean(q || state);

  const actor = await getActor();
  const events = await listEvents(actor, {
    q: q || null,
    state: (state as typeof EVENT_STATES[number]) || null,
    limit: 200,
  });

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

      <form
        method="get"
        action="/events"
        className="mb-8 flex flex-wrap items-center gap-3"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search events by name, slug, or description"
          aria-label="Search events"
          className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="state"
          defaultValue={state}
          aria-label="Filter by state"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          <option value="">All states</option>
          {FILTERABLE_STATES.map((s) => (
            <option key={s} value={s}>
              {EVENT_STATE_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
        {hasFilters ? (
          <Link
            href="/events"
            className="text-sm font-medium text-slate-500 hover:text-slate-700"
          >
            Clear
          </Link>
        ) : null}
      </form>

      {events.length === 0 ? (
        <p className="text-slate-500">
          {hasFilters ? "No events match your search." : "No events yet."}
        </p>
      ) : (
        <>
          {hasFilters ? (
            <p className="mb-4 text-sm text-slate-500">
              Showing {events.length} event{events.length === 1 ? "" : "s"}.
            </p>
          ) : null}
          <ul className="grid gap-4 sm:grid-cols-2">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/events/${event.id}`}
                  className="block h-full rounded-lg border border-slate-200 bg-white p-5 hover:border-slate-300"
                >
                  <h2 className="font-semibold">{event.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {event.description || event.slug}
                  </p>
                  <span
                    className={`mt-3 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                      STATE_PILL[event.state] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {EVENT_STATE_LABEL[event.state] ?? event.state}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}