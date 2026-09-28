import Link from "next/link";
import { EVENT_STATES } from "@dogfood/db";
import { listEvents } from "@dogfood/events";

import { Badge } from "../../components/badge";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../lib/event-flow";
import { getActor } from "../../server/session";

export const dynamic = "force-dynamic";

const FILTERABLE_STATES: readonly string[] = EVENT_STATES.filter(
  (state) => state !== "DRAFT" && state !== "ARCHIVED",
);

type EventCard = {
  slug: string;
  name: string;
  description: string | null;
  state: string;
  registrationClosesAt: Date | null;
  submissionClosesAt: Date | null;
};

function formatDeadline(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

function nextDeadline(event: EventCard): { label: string; value: string } | null {
  const submission = formatDeadline(event.submissionClosesAt);
  if (submission) return { label: "Submissions close", value: submission };
  const registration = formatDeadline(event.registrationClosesAt);
  if (registration) {
    return { label: "Registration closes", value: registration };
  }
  return null;
}

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
    <main className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-slate-500">
            {events.length} event{events.length === 1 ? "" : "s"} available
            {hasFilters ? " for the current filters" : ""}.
          </p>
        </div>
        {actor ? (
          <Link
            href="/events/new"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
          >
            New event
          </Link>
        ) : null}
      </div>

      <form
        method="get"
        action="/events"
        className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search events by name, slug, or description"
          aria-label="Search events"
          className="min-w-56 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        />
        <select
          name="state"
          defaultValue={state}
          aria-label="Filter by state"
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
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
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
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
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-slate-500">
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
            {events.map((event) => {
              const deadline = nextDeadline(event);
              return (
                <li key={event.id}>
                  <Link
                    href={`/events/${event.id}`}
                    className="block h-full rounded-xl border border-slate-200 bg-white p-5 transition hover:border-slate-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="min-w-0 font-semibold text-slate-900">
                        {event.name}
                      </h2>
                      <Badge tone={EVENT_STATE_TONE[event.state]}>
                        {EVENT_STATE_LABEL[event.state] ?? event.state}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {event.description || event.slug}
                    </p>
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                      <span aria-hidden="true">◷</span>
                      {deadline
                        ? `${deadline.label} ${deadline.value}`
                        : "No deadlines set"}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}
