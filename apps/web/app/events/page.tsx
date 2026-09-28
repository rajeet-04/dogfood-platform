import { CalendarClock, Plus } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { EVENT_STATES } from "@dogfood/db";
import { listEvents } from "@dogfood/events";

import { Badge } from "../../components/badge";
import { Button, ButtonLink } from "../../components/ui/button";
import { EmptyStatePanel } from "../../components/ui/empty-state";
import { Input, Select } from "../../components/ui/input";
import { Page, PageHeader } from "../../components/ui/page-header";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../lib/event-flow";
import { getActor } from "../../server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Events" };

const FILTERABLE_STATES: readonly string[] = EVENT_STATES.filter(
  (state) => state !== "DRAFT" && state !== "ARCHIVED",
);

type CatalogueEvent = Awaited<ReturnType<typeof listEvents>>[number];

function formatDeadline(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString(undefined, {
    dateStyle: "medium",
  });
}

function nextDeadline(
  event: CatalogueEvent,
): { label: string; value: string } | null {
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
    state: (state as (typeof EVENT_STATES)[number]) || null,
    limit: 200,
  });

  return (
    <Page>
      <PageHeader
        title="Events"
        description={
          actor
            ? "Events you own appear alongside every public event. Drafts and archived events are only visible to their organizers."
            : "Browse every public event. Drafts and archived events stay private to their organizers."
        }
        actions={
          actor ? (
            <ButtonLink href="/events/new">
              <Plus aria-hidden="true" className="size-4" />
              New event
            </ButtonLink>
          ) : null
        }
        className="mb-6"
      />

      <form
        method="get"
        action="/events"
        role="search"
        className="mb-6 flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-3 shadow-xs sm:flex-row sm:items-center"
      >
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search events by name, slug, or description"
          aria-label="Search events"
          className="sm:min-w-56 sm:flex-1"
        />
        <Select
          name="state"
          defaultValue={state}
          aria-label="Filter by state"
          className="sm:w-48"
        >
          <option value="">All states</option>
          {FILTERABLE_STATES.map((s) => (
            <option key={s} value={s}>
              {EVENT_STATE_LABEL[s]}
            </option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <Button type="submit">Search</Button>
          {hasFilters ? (
            <Link
              href="/events"
              className="rounded-xs text-small font-medium text-fg-subtle underline-offset-4 transition-colors hover:text-fg hover:underline"
            >
              Clear
            </Link>
          ) : null}
        </div>
      </form>

      {events.length === 0 ? (
        hasFilters ? (
          <EmptyStatePanel
            icon="search"
            title="No events match your search."
            description="Try a shorter query, or clear the filters to see everything public."
            action={
              <ButtonLink href="/events" variant="outline" size="sm">
                Show all events
              </ButtonLink>
            }
          />
        ) : (
          <EmptyStatePanel
            icon="calendar"
            title="No events yet."
            description={
              actor
                ? "Create the first event and you become its organizer."
                : "Once an organizer publishes an event it will show up here."
            }
            action={
              actor ? (
                <ButtonLink href="/events/new" size="sm">
                  <Plus aria-hidden="true" className="size-4" />
                  New event
                </ButtonLink>
              ) : null
            }
          />
        )
      ) : (
        <>
          {hasFilters ? (
            <p className="mb-4 text-small text-fg-subtle">
              Showing {events.length} event{events.length === 1 ? "" : "s"}.
            </p>
          ) : null}
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => {
              const deadline = nextDeadline(event);
              return (
                <li key={event.id} className="h-full">
                  <Link
                    href={`/events/${event.id}`}
                    className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <h2 className="min-w-0 text-subheading font-semibold text-fg group-hover:text-accent-hover">
                        {event.name}
                      </h2>
                      <Badge tone={EVENT_STATE_TONE[event.state]}>
                        {EVENT_STATE_LABEL[event.state] ?? event.state}
                      </Badge>
                    </div>
                    <p className="mt-1.5 line-clamp-2 grow text-small text-fg-subtle">
                      {event.description || event.slug}
                    </p>
                    <p className="mt-3.5 flex items-center gap-1.5 border-t border-line-subtle pt-2.5 text-caption text-fg-faint">
                      <CalendarClock aria-hidden="true" className="size-3.5 shrink-0" />
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
    </Page>
  );
}
