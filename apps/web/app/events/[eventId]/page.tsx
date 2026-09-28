import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, CalendarClock, ExternalLink, Globe } from "lucide-react";
import { and, db, eq, inArray, schema } from "@dogfood/db";
import {
  getMyJudgeApplication,
  JUDGE_APPLICATION_STATUS_LABEL,
} from "@dogfood/applications";

import { ActionForm } from "../../../components/action-form";
import { Badge, Metric } from "../../../components/badge";
import { Collapsible } from "../../../components/collapsible";
import {
  ResultsMeta,
  ResultsTable,
} from "../../../components/results-table";
import { Textarea } from "../../../components/ui/input";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../../lib/event-flow";
import { isUuidId } from "../../../lib/ids";
import {
  applyAsJudgeAction,
  withdrawJudgeApplicationAction,
} from "../../../server/actions/applications";
import { joinEventAction } from "../../../server/actions/members";
import { formatScore, getEventResults } from "../../../server/read-models/results";
import { getPublicRubric } from "../../../server/read-models/rubric";
import { getActor } from "../../../server/session";
import { getVotingConfig } from "@dogfood/voting";

export const dynamic = "force-dynamic";

function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "Not set";
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function EventLandingPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId: eventParam } = await params;
  const actor = await getActor();

  // The segment is an id, but slugs are accepted too: a non-UUID value can
  // never match the uuid column, so it is matched against the slug instead.
  // Everything downstream uses the resolved id.
  const isUuid = isUuidId(eventParam);
  const rows = await db
    .select()
    .from(schema.events)
    .where(
      isUuid
        ? eq(schema.events.id, eventParam)
        : eq(schema.events.slug, eventParam),
    )
    .limit(1);
  const event = rows[0];
  if (!event) notFound();
  const eventId = event.id;
  const now = new Date();
  const votingConfig = event.state === "JUDGING" ? await getVotingConfig(eventId) : null;
  const communityVotingOpen = Boolean(
    votingConfig?.opensAt &&
    votingConfig.closesAt &&
    votingConfig.opensAt <= now &&
    now < votingConfig.closesAt,
  );

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

  const links: Array<{ label: string; href: string; hint: string }> = [];
  if (roles.includes("PARTICIPANT")) {
    links.push({
      label: "Participant dashboard",
      hint: "Team, project, submission deadlines and your result",
      href: `/events/${eventId}/participant`,
    });
  }
  if (roles.includes("JUDGE")) {
    links.push({
      label: "Judge queue",
      hint: "Assigned projects, evaluations in progress and coverage",
      href: `/events/${eventId}/judge`,
    });
  }
  if (roles.includes("ORGANIZER") || actor?.isPlatformAdmin) {
    links.push({
      label: "Organizer dashboard",
      hint: "Members, rubrics, judging, certificates and event state",
      href: `/events/${eventId}/organizer`,
    });
  }

  const stateLabel = EVENT_STATE_LABEL[event.state] ?? event.state;

  const withinWindow =
    event.state === "REGISTRATION" &&
    (!event.registrationOpensAt || event.registrationOpensAt <= now) &&
    (!event.registrationClosesAt || event.registrationClosesAt >= now);

  const notMember = links.length === 0;
  let application:
    | { status: string; rationale: string | null }
    | null = null;
  if (actor && notMember) {
    const mine = await getMyJudgeApplication(actor, eventId);
    if (mine) {
      application = {
        status: mine.status,
        rationale: mine.rationale,
      };
    }
  }

  const canJoin = Boolean(actor) && withinWindow && notMember;
  const canApplyAsJudge =
    Boolean(actor) && withinWindow && notMember && !application;

  const results = await getEventResults(eventId);
  const rubric = await getPublicRubric(eventId);
  const prizes = await db.select().from(schema.eventPrizes)
    .where(eq(schema.eventPrizes.eventId, eventId))
    .orderBy(schema.eventPrizes.sortOrder, schema.eventPrizes.createdAt);
  const prizeTrackIds = [...new Set(prizes.map((prize) => prize.trackId).filter((id): id is string => Boolean(id)))];
  const prizeTracks = prizeTrackIds.length
    ? await db.select({ id: schema.eventTracks.id, name: schema.eventTracks.name }).from(schema.eventTracks)
        .where(and(eq(schema.eventTracks.eventId, eventId), inArray(schema.eventTracks.id, prizeTrackIds)))
    : [];
  const prizeTrackNames = new Map(prizeTracks.map((track) => [track.id, track.name]));

  const scoredCriteria = new Set<string>();
  let maxScorers = 0;
  for (const entry of results?.entries ?? []) {
    for (const criterion of entry.criteria) {
      scoredCriteria.add(criterion.name);
      if (criterion.scoredBy > maxScorers) maxScorers = criterion.scoredBy;
    }
  }

  const briefExtras = [
    event.prizeInfo || prizes.length ? "Prizes" : null,
    event.timeline ? "Timeline" : null,
    event.schedule ? "Schedule" : null,
    event.rules ? "Rules" : null,
  ].filter(Boolean) as string[];

  const briefSection = (heading: string, body: string | null, testId: string) =>
    body ? (
      <div>
        <h3 className="text-small font-semibold text-fg">{heading}</h3>
        <p
          data-testid={testId}
          className="mt-1 text-small whitespace-pre-wrap text-fg-muted"
        >
          {body}
        </p>
      </div>
    ) : null;

  return (
    <main>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 sm:py-9 lg:px-8">
          <Badge tone={EVENT_STATE_TONE[event.state]}>{stateLabel}</Badge>
          <h1 className="mt-3 text-display font-semibold text-fg">{event.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-fg-subtle">
            <span className="font-mono text-caption">/{event.slug}</span>
            <span className="inline-flex items-center gap-1.5">
              <Globe aria-hidden="true" className="size-3.5" />
              {event.timezone}
            </span>
          </p>
        </div>
      </div>

      {event.state === "ARCHIVED" ? (
        <div
          data-testid="archived-notice"
          className="border-b border-warning-border bg-warning-soft px-4 py-2.5 text-center text-small font-medium text-warning-fg"
        >
          This event has been archived and is no longer active.
        </div>
      ) : null}

      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
        <div className="min-w-0 space-y-5">
          {communityVotingOpen ? (
            <section
              data-testid="community-voting-callout"
              className="flex flex-col gap-4 rounded-xl border border-accent-border bg-accent-soft/50 p-5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <h2 className="text-subheading font-semibold text-fg">
                  Choose a community favorite
                </h2>
                <p className="mt-1 max-w-prose text-small text-fg-muted">
                  Sign in to cast one vote. Community tallies stay hidden until voting closes.
                </p>
              </div>
              <Link
                href={"/events/" + eventId + "/vote"}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-accent px-4 text-small font-semibold text-accent-fg shadow-xs transition-colors hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-ring)]"
              >
                Community vote
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </section>
          ) : null}

          {event.description || event.websiteUrl || briefExtras.length > 0 ? (
            <section
              className="rounded-xl border border-line bg-surface p-5"
              data-testid="event-about"
            >
              <h2 className="text-heading font-semibold text-fg">
                About this event
              </h2>
              {event.description ? (
                <p className="mt-2 text-body whitespace-pre-wrap text-fg-muted">
                  {event.description}
                </p>
              ) : null}

              {event.websiteUrl ? (
                <p className="mt-3">
                  <a
                    href={event.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="event-website-link"
                    className="inline-flex items-center gap-1.5 text-small font-medium text-accent hover:text-accent-hover hover:underline"
                  >
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                    Visit the event website
                  </a>
                </p>
              ) : null}

              {briefExtras.length > 0 ? (
                <Collapsible
                  variant="plain"
                  className="mt-4 border-t border-line-subtle pt-1"
                  title={<span className="text-body">Event brief</span>}
                  meta={briefExtras.map((label) => (
                    <Badge key={label} tone="slate">
                      {label}
                    </Badge>
                  ))}
                >
                  <div className="space-y-4">
                    {prizes.length ? (
                      <div data-testid="event-prizes">
                        <h3 className="text-small font-semibold text-fg">Prizes</h3>
                        <ul className="mt-1 space-y-2 text-small text-fg-muted">
                          {prizes.map((prize) => (
                            <li key={prize.id} className="rounded-md bg-surface-subtle px-3 py-2">
                              <span className="font-medium text-fg">{prize.name}</span>
                              {prize.trackId ? <span> · {prizeTrackNames.get(prize.trackId) ?? "Track"}</span> : null}
                              {prize.amount ? <span> · {prize.currency ? `${prize.currency} ` : ""}{prize.amount}</span> : null}
                              {prize.description ? <p className="mt-0.5">{prize.description}</p> : null}
                            </li>
                          ))}
                        </ul>
                        {event.prizeInfo ? <p className="mt-2 whitespace-pre-wrap">{event.prizeInfo}</p> : null}
                      </div>
                    ) : briefSection("Prizes", event.prizeInfo, "event-prize")}
                    {briefSection("Timeline", event.timeline, "event-timeline")}
                    {briefSection("Schedule", event.schedule, "event-schedule")}
                    {briefSection("Rules", event.rules, "event-rules")}
                  </div>
                </Collapsible>
              ) : null}
            </section>
          ) : null}

          {results ? (
            <section
              className="rounded-xl border border-line bg-surface p-5"
              data-testid="public-results"
            >
              <h2 className="text-heading font-semibold text-fg">Results</h2>
              <ResultsMeta results={results} />
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Metric
                  label="Projects ranked"
                  value={results.entries.length}
                />
                <Metric
                  label="Top score"
                  value={
                    results.entries.length > 0
                      ? formatScore(
                          results.entries[0].weightedTotal ??
                            results.entries[0].score,
                        )
                      : "—"
                  }
                />
                <Metric
                  label="Criteria scored"
                  value={scoredCriteria.size}
                  hint={`max ${maxScorers} judge${maxScorers === 1 ? "" : "s"}`}
                />
              </div>
              <ResultsTable results={results} showCriteria={false} />
            </section>
          ) : null}

          {rubric && rubric.criteria.length > 0 ? (
            <Collapsible
              title="Judging rubric"
              testId="public-rubric"
              meta={`${rubric.name} · v${rubric.version} · ${rubric.criteria.length} criteria · weight ${rubric.weightSum}`}
            >
              <p className="text-small text-fg-subtle">
                Judges score every submitted project against these criteria.
              </p>
              <ul className="mt-3 divide-y divide-line-subtle">
                {rubric.criteria.map((criterion) => (
                  <li key={criterion.name} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-small font-medium text-fg">
                        {criterion.name}
                        {criterion.optional ? (
                          <span className="ml-2 text-caption font-normal text-fg-faint">
                            optional
                          </span>
                        ) : null}
                      </p>
                      <p className="text-caption text-fg-subtle">
                        weight {criterion.weight} · {criterion.minScore}–
                        {criterion.maxScore}
                      </p>
                    </div>
                    {criterion.description ? (
                      <p className="mt-1 text-small text-fg-muted">
                        {criterion.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Collapsible>
          ) : null}

          {links.length ? (
            <section>
              <h2 className="mb-2.5 text-heading font-semibold text-fg">
                Your dashboard
              </h2>
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm"
                    >
                      <span className="flex items-center justify-between gap-2 font-medium text-fg">
                        {link.label}
                        <ArrowRight
                          aria-hidden="true"
                          className="size-4 shrink-0 text-fg-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
                        />
                      </span>
                      <span className="mt-1 text-small text-fg-subtle">
                        {link.hint}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!links.length && !canJoin && !application ? (
            <section className="rounded-xl border border-dashed border-line-strong bg-surface-sunken/40 p-5">
              <p className="text-small text-fg-muted">
                {actor
                  ? `Registration for this event is ${withinWindow ? "open" : "not open right now"}.`
                  : "Sign in to join this event."}
              </p>
              {!actor && withinWindow ? (
                <Link
                  href={`/login?next=/events/${eventId}`}
                  className="mt-3 inline-flex items-center gap-1.5 text-small font-medium text-accent hover:text-accent-hover hover:underline"
                >
                  Sign in to join
                </Link>
              ) : null}
            </section>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-caption font-semibold tracking-wide text-fg-faint uppercase">
              Event details
            </h2>
            <dl className="mt-3 space-y-2.5">
              <div className="flex items-start justify-between gap-3 text-small">
                <dt className="text-fg-subtle">Status</dt>
                <dd className="text-right font-medium text-fg">{stateLabel}</dd>
              </div>
              <div className="flex items-start justify-between gap-3 text-small">
                <dt className="text-fg-subtle">Timezone</dt>
                <dd className="text-right font-medium text-fg">
                  {event.timezone}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 text-small">
                <dt className="text-fg-subtle">Applications open</dt>
                <dd className="text-right font-medium text-fg">
                  {formatDateTime(event.registrationOpensAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 text-small">
                <dt className="text-fg-subtle">Applications close</dt>
                <dd className="text-right font-medium text-fg">
                  {formatDateTime(event.registrationClosesAt)}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3 text-small">
                <dt className="text-fg-subtle">Submissions close</dt>
                <dd className="text-right font-medium text-fg">
                  {formatDateTime(event.submissionClosesAt)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-line bg-surface p-5">
            {links.length ? (
              <div className="rounded-md border border-success-border bg-success-soft px-3 py-2.5">
                <p className="text-small font-semibold text-success-fg">
                  You are part of this event
                </p>
                <p className="mt-0.5 text-caption text-fg-subtle">
                  Use your dashboard above to keep working.
                </p>
              </div>
            ) : application ? (
              <div className="rounded-md border border-line bg-surface-sunken/50 p-3.5">
                <p
                  data-testid="judge-application-status"
                  className="text-small font-semibold text-fg"
                >
                  Judge application:{" "}
                  {JUDGE_APPLICATION_STATUS_LABEL[
                    application.status as keyof typeof JUDGE_APPLICATION_STATUS_LABEL
                  ] ?? application.status}
                </p>
                {application.rationale ? (
                  <p className="mt-1 text-small text-fg-subtle">
                    {application.rationale}
                  </p>
                ) : null}
                {application.status === "pending" ? (
                  <div className="mt-3">
                    <ActionForm
                      action={withdrawJudgeApplicationAction.bind(null, eventId)}
                      submitLabel="Withdraw application"
                      className="[&_button]:w-full"
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-caption text-fg-faint">
                    You can submit a new application at any time.
                  </p>
                )}
              </div>
            ) : canJoin || canApplyAsJudge ? (
              <div className="rounded-md border border-line bg-surface-sunken/50 p-3.5">
                <p className="mb-3 text-small font-semibold text-fg">
                  Take part in this event
                </p>
                <ActionForm
                  action={joinEventAction.bind(null, eventId)}
                  submitLabel="Join as participant"
                  className="[&_button]:w-full"
                />
                <ActionForm
                  action={applyAsJudgeAction.bind(null, eventId)}
                  submitLabel="Apply as judge"
                  className="mt-2 [&_button]:w-full"
                  submitVariant="outline"
                >
                  <Textarea
                    name="rationale"
                    rows={3}
                    placeholder="Optional: tell organizers about your judging experience."
                    className="mt-3"
                  />
                  <label className="mt-3 block text-caption font-medium text-fg-subtle">
                    CV or resume (optional)
                    <input
                      type="file"
                      name="attachment"
                      data-testid="judge-application-attachment"
                      accept=".pdf,.doc,.docx,.txt,image/png,image/jpeg"
                      className="mt-1 block w-full text-caption text-fg-muted file:mr-3 file:rounded-sm file:border-0 file:bg-surface-hover file:px-3 file:py-1.5 file:text-caption file:font-medium file:text-fg"
                    />
                  </label>
                  <p className="mt-1 text-caption text-fg-faint">
                    PDF, Word, text, PNG or JPEG up to 5MB.
                  </p>
                </ActionForm>
              </div>
            ) : (
              <p className="rounded-md bg-surface-sunken px-3 py-2.5 text-small text-fg-subtle">
                {actor ? "Registration closed" : "Sign in to apply for this event"}
              </p>
            )}
            {!actor && withinWindow ? (
              <Link
                href={`/login?next=/events/${eventId}`}
                className="mt-3 block rounded-md bg-accent px-3.5 py-2.5 text-center text-small font-semibold text-fg-onAccent transition-colors hover:bg-accent-hover"
              >
                Sign in to join this event
              </Link>
            ) : null}
          </section>

          {!actor ? (
            <p className="flex items-start gap-2 px-1 text-caption text-fg-faint">
              <CalendarClock aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              Only the event organizer can change dates, publish results or issue
              certificates.
            </p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
