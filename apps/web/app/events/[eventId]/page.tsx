import Link from "next/link";
import { notFound } from "next/navigation";
import { and, db, eq, schema } from "@dogfood/db";
import {
  getMyJudgeApplication,
  JUDGE_APPLICATION_STATUS_LABEL,
} from "@dogfood/applications";

import { ActionForm } from "../../../components/action-form";
import {
  ResultsMeta,
  ResultsTable,
} from "../../../components/results-table";
import { EVENT_STATE_LABEL } from "../../../lib/event-flow";
import {
  applyAsJudgeAction,
  withdrawJudgeApplicationAction,
} from "../../../server/actions/applications";
import { joinEventAction } from "../../../server/actions/members";
import { getEventResults } from "../../../server/read-models/results";
import { getPublicRubric } from "../../../server/read-models/rubric";
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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  const isUuid = UUID_PATTERN.test(eventParam);
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

  const now = new Date();
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

      {event.state === "ARCHIVED" ? (
        <div
          data-testid="archived-notice"
          className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-800"
        >
          This event has been archived and is no longer active.
        </div>
      ) : null}

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          {event.description ||
          event.prizeInfo ||
          event.timeline ||
          event.schedule ||
          event.rules ||
          event.websiteUrl ? (
            <div
              className="rounded-2xl border border-slate-200 bg-white p-6"
              data-testid="event-about"
            >
              <h2 className="mb-3 text-lg font-semibold">About this event</h2>
              {event.description ? (
                <p className="whitespace-pre-wrap text-slate-600">
                  {event.description}
                </p>
              ) : null}

              {event.websiteUrl ? (
                <p className="mt-3 text-sm">
                  <a
                    href={event.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="event-website-link"
                    className="font-medium text-indigo-600 hover:underline"
                  >
                    Visit the event website
                  </a>
                </p>
              ) : null}

              {event.prizeInfo ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-900">Prizes</h3>
                  <p
                    data-testid="event-prize"
                    className="mt-1 whitespace-pre-wrap text-sm text-slate-600"
                  >
                    {event.prizeInfo}
                  </p>
                </div>
              ) : null}

              {event.timeline ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Timeline
                  </h3>
                  <p
                    data-testid="event-timeline"
                    className="mt-1 whitespace-pre-wrap text-sm text-slate-600"
                  >
                    {event.timeline}
                  </p>
                </div>
              ) : null}

              {event.schedule ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Schedule
                  </h3>
                  <p
                    data-testid="event-schedule"
                    className="mt-1 whitespace-pre-wrap text-sm text-slate-600"
                  >
                    {event.schedule}
                  </p>
                </div>
              ) : null}

              {event.rules ? (
                <div className="mt-5">
                  <h3 className="text-sm font-semibold text-slate-900">Rules</h3>
                  <p
                    data-testid="event-rules"
                    className="mt-1 whitespace-pre-wrap text-sm text-slate-600"
                  >
                    {event.rules}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {rubric && rubric.criteria.length > 0 ? (
            <section
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"
              data-testid="public-rubric"
            >
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">Judging rubric</h2>
                <span className="text-xs text-slate-500">
                  {rubric.name} · v{rubric.version}
                </span>
              </div>
              <p className="mb-4 text-sm text-slate-500">
                Judges score every submitted project against these criteria.
                Total weight: {rubric.weightSum}.
              </p>
              <ul className="divide-y divide-slate-100">
                {rubric.criteria.map((criterion) => (
                  <li key={criterion.name} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">
                        {criterion.name}
                        {criterion.optional ? (
                          <span className="ml-2 text-xs font-normal text-slate-400">
                            optional
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-slate-500">
                        weight {criterion.weight} · {criterion.minScore}–
                        {criterion.maxScore}
                      </p>
                    </div>
                    {criterion.description ? (
                      <p className="mt-1 text-sm text-slate-600">
                        {criterion.description}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
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

          {!links.length && !canJoin && !application ? (
            <section className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-6">
              <p className="text-slate-500">
                {actor
                  ? `Registration for this event is ${withinWindow ? "open" : "not open right now"}.`
                  : "Sign in to join this event."}
              </p>
              {!actor && withinWindow ? (
                <Link
                  href={`/login?next=/events/${eventId}`}
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

          <div className="mt-6 space-y-3">
          {results ? (
            <section
              className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"
              data-testid="public-results"
            >
              <h2 className="mb-1 text-lg font-semibold">Results</h2>
              <ResultsMeta results={results} />
              <ResultsTable results={results} showCriteria={false} />
            </section>
          ) : null}

          {links.length ? (
              <span className="inline-block rounded-lg bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
                You are part of this event
              </span>
            ) : application ? (
              <div className="rounded-lg border border-slate-200 p-4">
                <p
                  data-testid="judge-application-status"
                  className="text-sm font-semibold text-slate-700"
                >
                  Judge application:{" "}
                  {JUDGE_APPLICATION_STATUS_LABEL[
                    application.status as keyof typeof JUDGE_APPLICATION_STATUS_LABEL
                  ] ?? application.status}
                </p>
                {application.rationale ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {application.rationale}
                  </p>
                ) : null}
                {application.status === "pending" ? (
                  <div className="mt-3">
                    <ActionForm
                      action={withdrawJudgeApplicationAction.bind(null, eventId)}
                      submitLabel="Withdraw application"
                      className="[&_button]:w-full [&_button]:bg-slate-100 [&_button]:text-slate-600"
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">
                    You can submit a new application at any time.
                  </p>
                )}
              </div>
            ) : canJoin || canApplyAsJudge ? (
              <div className="rounded-lg border border-slate-200 p-4">
                <ActionForm
                  action={joinEventAction.bind(null, eventId)}
                  submitLabel="Join as participant"
                  className="[&_button]:w-full"
                />
                <ActionForm
                  action={applyAsJudgeAction.bind(null, eventId)}
                  submitLabel="Apply as judge"
                  className="mt-2 [&_button]:w-full [&_button]:bg-white [&_button]:text-slate-700 [&_button]:ring-1 [&_button]:ring-inset [&_button]:ring-slate-300 [&_button]:hover:bg-slate-50"
                >
                  <textarea
                    name="rationale"
                    rows={3}
                    placeholder="Optional: tell organizers about your judging experience."
                    className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                  <label className="mt-3 block text-xs font-medium text-slate-600">
                    CV or resume (optional)
                    <input
                      type="file"
                      name="attachment"
                      data-testid="judge-application-attachment"
                      accept=".pdf,.doc,.docx,.txt,image/png,image/jpeg"
                      className="mt-1 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700"
                    />
                  </label>
                  <p className="mt-1 text-xs text-slate-400">
                    PDF, Word, text, PNG or JPEG up to 5MB.
                  </p>
                </ActionForm>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
                {actor
                  ? "Registration closed"
                  : "Sign in to apply for this event"}
              </p>
            )}
            {!actor && withinWindow ? (
              <Link
                href={`/login?next=/events/${eventId}`}
                className="block rounded-lg bg-indigo-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500"
              >
                Sign in to join this event
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </main>
  );
}