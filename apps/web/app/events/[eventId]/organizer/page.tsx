import Link from "next/link";
import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import {
  Badge,
  type BadgeTone,
  EmptyState,
  Progress,
} from "../../../../components/badge";
import { Collapsible } from "../../../../components/collapsible";
import { NotAllowed } from "../../../../components/not-allowed";
import {
  EVENT_ROLE_TONE,
  EVENT_STATE_LABEL,
  EVENT_STATE_TONE,
  nextEventState,
} from "../../../../lib/event-flow";
import { requireActor } from "../../../../server/session";
import { getOrganizerDocument } from "../../../../server/read-models/organizer";
import { getEventResults } from "../../../../server/read-models/results";
import {
  ResultsMeta,
  ResultsTable,
} from "../../../../components/results-table";
import {
  updateEventDetailsAction,
  updateRegistrationWindowAction,
} from "../../../../server/actions/event";
import {
  deactivateJudgeAction,
  decideJudgeApplicationAction,
} from "../../../../server/actions/applications";
import { JUDGE_APPLICATION_STATUS_LABEL } from "@dogfood/applications";
import { transitionEventAction } from "../../../../server/actions/event";
import {
  activateRubricAction,
  addCriterionAction,
  assignJudgeAction,
  createRubricAction,
} from "../../../../server/actions/rubric";
import {
  lockAllSubmissionsAction,
  lockEvaluationAction,
  unassignJudgeAction,
} from "../../../../server/actions/evaluation";
import {
  addMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "../../../../server/actions/members";
import {
  lockAllProjectsAction,
  lockProjectAction,
} from "../../../../server/actions/submissions";
import {
  issueCertificatesAction,
  revokeCertificatesAction,
} from "../../../../server/actions/certificates";
import { CERTIFICATE_TIER_LABEL } from "@dogfood/certificates";
import { canRunRanking } from "@dogfood/ranking";
import {
  generateRankingAction,
  publishRankingAction,
} from "../../../../server/actions/ranking";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ASSIGNED: "Assigned",
  IN_PROGRESS: "In progress",
  SUBMITTED: "Submitted",
  LOCKED: "Locked",
};

const ROLE_LABEL: Record<string, string> = {
  PARTICIPANT: "Participant",
  JUDGE: "Judge",
  ORGANIZER: "Organizer",
};

const PROJECT_STATE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  LOCKED: "Locked",
};

const PROJECT_STATE_TONE: Record<string, BadgeTone> = {
  DRAFT: "slate",
  SUBMITTED: "sky",
  LOCKED: "indigo",
};

const ASSIGNMENT_STATUS_TONE: Record<string, BadgeTone> = {
  ASSIGNED: "slate",
  IN_PROGRESS: "sky",
  SUBMITTED: "emerald",
  LOCKED: "indigo",
};

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function toLocalInput(value: Date | null | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const actor = await requireActor();

  let doc;
  try {
    doc = await getOrganizerDocument(actor, eventId);
  } catch (err) {
    if (err instanceof DogfoodError) {
      if (err.code === "NOT_FOUND") notFound();
      if (err.code === "FORBIDDEN") {
        return (
          <NotAllowed message={err.message} backHref={`/events/${eventId}`} />
        );
      }
    }
    throw err;
  }

  const nextState = nextEventState(doc.event.state);
  const { coverage } = doc;
  const results = await getEventResults(eventId, { includeUnpublished: true });

  const detailFields = [
    ["Description", Boolean(doc.event.description)],
    ["Website", Boolean(doc.event.websiteUrl)],
    ["Prizes", Boolean(doc.event.prizeInfo)],
    ["Timeline", Boolean(doc.event.timeline)],
    ["Schedule", Boolean(doc.event.schedule)],
    ["Rules", Boolean(doc.event.rules)],
  ] as const;
  const filledDetails = detailFields
    .filter(([, filled]) => filled)
    .map(([label]) => label);
  const pendingApplications = doc.applications.filter(
    (application) => application.status === "pending",
  ).length;
  const lockedProjects = doc.projects.filter(
    (project) => project.state === "LOCKED",
  ).length;

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href={`/events/${doc.event.id}`} className="hover:underline">
              {doc.event.name}
            </Link>
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Organizer dashboard</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge
              testId="event-state"
              tone={EVENT_STATE_TONE[doc.event.state] ?? "slate"}
            >
              {EVENT_STATE_LABEL[doc.event.state] ?? doc.event.state}
            </Badge>
            <span className="text-xs text-slate-400">
              {doc.members.length} member{doc.members.length === 1 ? "" : "s"} ·{" "}
              {doc.projects.length} project{doc.projects.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {nextState ? (
          <ActionForm
            action={transitionEventAction.bind(null, eventId)}
            submitLabel={`Advance to ${EVENT_STATE_LABEL[nextState]}`}
            className={
              nextState === "ARCHIVED"
                ? "[&_button]:bg-amber-600 [&_button]:text-white [&_button]:hover:bg-amber-500"
                : undefined
            }
          >
            <input type="hidden" name="toState" value={nextState} />
          </ActionForm>
        ) : doc.event.state === "ARCHIVED" ? (
          <ActionForm
            action={transitionEventAction.bind(null, eventId)}
            submitLabel="Unarchive event"
          >
            <input type="hidden" name="toState" value="PUBLISHED" />
          </ActionForm>
        ) : null}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-semibold">Judging progress</h2>
        <div className="mt-4">
          <Progress
            value={coverage.completed}
            max={coverage.total}
            label="Judging completion"
          />
          <p className="mt-2 text-xs text-slate-500">
            {coverage.completed} of {coverage.total} evaluations complete
          </p>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="font-medium text-slate-500">Assignments</dt>
            <dd className="text-2xl font-bold" data-testid="coverage-total">
              {coverage.total}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">In progress</dt>
            <dd className="text-2xl font-bold">{coverage.inProgress}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Submitted</dt>
            <dd className="text-2xl font-bold">{coverage.submitted}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-500">Locked</dt>
            <dd className="text-2xl font-bold">{coverage.locked}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-slate-500">
          Completed{" "}
          <span
            className="font-semibold text-slate-700"
            data-testid="coverage-completed"
          >
            {coverage.completed} / {coverage.total}
          </span>
        </p>
        {doc.scoresHidden ? (
          <p
            data-testid="scores-hidden-note"
            className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700"
          >
            Judge scores are hidden while judging is in progress. You can see
            completion but not individual scores.
          </p>
        ) : (
          <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Individual judge scores stay hidden. Ranked scores and per-criterion
            breakdowns appear under &ldquo;Latest scores&rdquo; once a ranking
            snapshot exists.
          </p>
        )}
      </section>

      <Collapsible
        title="Event details"
        meta={
          filledDetails.length > 0 ? (
            filledDetails.map((label) => (
              <Badge key={label} tone="emerald">
                {label}
              </Badge>
            ))
          ) : (
            <span className="text-slate-400">Nothing filled in yet</span>
          )
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          Everything here is shown publicly on the event page under “About this
          event”.
        </p>
        <ActionForm
          action={updateEventDetailsAction.bind(null, eventId)}
          submitLabel="Save details"
        >
          <div className="space-y-4">
            <label className="block text-sm font-medium">
              Description
              <textarea
                name="description"
                rows={4}
                defaultValue={doc.event.description ?? ""}
                placeholder="What is this event about?"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Event website
                <input
                  type="url"
                  name="websiteUrl"
                  defaultValue={doc.event.websiteUrl ?? ""}
                  placeholder="https://example.com"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Maximum team size
                <input
                  type="number"
                  name="maxTeamSize"
                  min={2}
                  max={100}
                  defaultValue={doc.event.maxTeamSize ?? ""}
                  placeholder="Unlimited"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </div>
            <label className="block text-sm font-medium">
              Prizes
              <textarea
                name="prizeInfo"
                rows={2}
                defaultValue={doc.event.prizeInfo ?? ""}
                placeholder="e.g. $5,000 for the winning team, plus sponsor prizes."
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Timeline
              <textarea
                name="timeline"
                rows={3}
                defaultValue={doc.event.timeline ?? ""}
                placeholder={"Registration opens\nSubmissions close\nJudging starts"}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Schedule
              <textarea
                name="schedule"
                rows={3}
                defaultValue={doc.event.schedule ?? ""}
                placeholder={"Day 1 · 09:00 Opening ceremony\nDay 1 · 13:00 Hacking starts"}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Rules
              <textarea
                name="rules"
                rows={4}
                defaultValue={doc.event.rules ?? ""}
                placeholder="Eligibility, judging criteria, code of conduct…"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </ActionForm>
      </Collapsible>

      <Collapsible
        title="Registration window"
        meta={
          <>
            <Badge tone={doc.event.registrationOpensAt ? "slate" : "amber"}>
              {doc.event.registrationOpensAt
                ? `Opens ${formatDate(doc.event.registrationOpensAt)}`
                : "No opening date"}
            </Badge>
            <Badge tone={doc.event.registrationClosesAt ? "slate" : "amber"}>
              {doc.event.registrationClosesAt
                ? `Closes ${formatDate(doc.event.registrationClosesAt)}`
                : "No closing date"}
            </Badge>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          The window during which participants can join and judges can apply.
          Leave a field empty to disable that boundary.
        </p>
        <ActionForm
          action={updateRegistrationWindowAction.bind(null, eventId)}
          submitLabel="Save window"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Opens
              <input
                type="datetime-local"
                name="registrationOpensAt"
                defaultValue={toLocalInput(doc.event.registrationOpensAt)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Closes
              <input
                type="datetime-local"
                name="registrationClosesAt"
                defaultValue={toLocalInput(doc.event.registrationClosesAt)}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </div>
        </ActionForm>
      </Collapsible>

      <Collapsible
        title="Submissions"
        meta={
          <>
            <Badge tone="slate">
              {doc.projects.length} submitted
            </Badge>
            {lockedProjects > 0 ? (
              <Badge tone="emerald">{lockedProjects} locked</Badge>
            ) : null}
          </>
        }
        bodyClassName="!px-0 !py-0"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <p className="text-sm text-slate-500">
            Locking a project freezes its latest revision.
          </p>
          <ActionForm
            action={lockAllProjectsAction.bind(null, eventId)}
            submitLabel="Lock all submissions"
            className="[&_button]:mt-0 [&_button]:rounded-md [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold"
          />
        </div>
        {doc.projects.length === 0 ? (
          <EmptyState>No projects yet.</EmptyState>
        ) : (
          <ul>
            {doc.projects.map((project) => (
              <li
                key={project.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 px-6 py-4 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {project.title}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {project.teamName}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={PROJECT_STATE_TONE[project.state] ?? "slate"}>
                    {PROJECT_STATE_LABEL[project.state] ?? project.state}
                  </Badge>
                  {project.state !== "LOCKED" ? (
                    <ActionForm
                      action={lockProjectAction.bind(
                        null,
                        eventId,
                        project.id,
                      )}
                      submitLabel="Lock"
                      className="[&_button]:mt-0 [&_button]:rounded-md [&_button]:bg-slate-100 [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:text-slate-600 [&_button]:hover:bg-red-50 [&_button]:hover:text-red-600"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold">Members</h2>
          <Badge tone="indigo">{doc.members.length} total</Badge>
        </div>

        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <ActionForm
            action={addMemberAction.bind(null, eventId)}
            submitLabel="Add member"
            className="flex flex-wrap items-end gap-3 [&_button]:mt-0 [&_button]:rounded-lg [&_button]:bg-indigo-600 [&_button]:hover:bg-indigo-500"
          >
            <label className="block min-w-56 flex-1 text-sm font-medium">
              Email
              <input
                type="email"
                name="email"
                required
                placeholder="someone@example.com"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm font-medium">
              Role
              <select
                name="role"
                aria-label="Role for new member"
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="JUDGE">Judge</option>
                <option value="ORGANIZER">Organizer</option>
              </select>
            </label>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">
            Invite someone by email, or let participants self-join from the
            event page while registration is open.
          </p>
        </div>

        {doc.members.length === 0 ? (
          <EmptyState>No members yet.</EmptyState>
        ) : (
          <ul>
            {doc.members.map((member) => (
              <li
                key={member.userId}
                data-testid="member-row"
                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-50 px-6 py-4 last:border-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-sm font-semibold text-white">
                    {initials(member.displayName)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {member.displayName}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {member.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge
                    testId="member-role"
                    tone={EVENT_ROLE_TONE[member.role] ?? "slate"}
                  >
                    {ROLE_LABEL[member.role] ?? member.role}
                  </Badge>
                  <ActionForm
                    action={changeMemberRoleAction.bind(
                      null,
                      eventId,
                      member.userId,
                    )}
                    submitLabel="Update"
                    submitDisabled={actor.userId === member.userId}
                    className="flex items-end gap-2 [&_button]:mb-0.5 [&_button]:mt-0"
                  >
                    <select
                      name="role"
                      defaultValue={member.role}
                      aria-label={`Role for ${member.displayName}`}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                    >
                      <option value="PARTICIPANT">Participant</option>
                      <option value="JUDGE">Judge</option>
                      <option value="ORGANIZER">Organizer</option>
                    </select>
                  </ActionForm>
                  {actor.userId !== member.userId ? (
                    <ActionForm
                      action={removeMemberAction.bind(
                        null,
                        eventId,
                        member.userId,
                      )}
                      submitLabel="Remove"
                      className="[&_button]:bg-slate-100 [&_button]:text-slate-600 [&_button]:hover:bg-red-50 [&_button]:hover:text-red-600 [&_button]:mt-0"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Collapsible
        title="Judge applications"
        meta={
          <>
            <Badge tone="slate">{doc.applications.length} total</Badge>
            {pendingApplications > 0 ? (
              <Badge tone="amber">{pendingApplications} awaiting review</Badge>
            ) : null}
          </>
        }
        bodyClassName="!px-0 !py-0"
      >
        {doc.applications.length === 0 ? (
          <EmptyState className="!py-8">No judge applications yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {doc.applications.map((application) => (
              <li
                key={application.id}
                className="flex items-start justify-between gap-4 px-6 py-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-slate-800">
                    {application.displayName}
                    <span className="ml-2 text-xs text-slate-400">
                      {application.email}
                    </span>
                  </p>
                  {application.rationale ? (
                    <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                      {application.rationale}
                    </p>
                  ) : null}
                  {application.attachmentName ? (
                    <p className="mt-1 text-xs">
                      <a
                        href={`/api/v1/events/${eventId}/judge-applications/${application.id}/attachment`}
                        data-testid="application-attachment"
                        className="text-blue-600 hover:underline"
                      >
                        Download {application.attachmentName}
                      </a>
                      {application.attachmentSize
                        ? ` (${Math.max(1, Math.round(application.attachmentSize / 1024))}KB)`
                        : null}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">
                    Applied {formatDate(application.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge testId="application-status" tone="slate">
                    {JUDGE_APPLICATION_STATUS_LABEL[
                      application.status as keyof typeof JUDGE_APPLICATION_STATUS_LABEL
                    ] ?? application.status}
                  </Badge>
                  {application.status === "pending" ? (
                    <>
                      <ActionForm
                        action={decideJudgeApplicationAction.bind(
                          null,
                          eventId,
                          application.id,
                          "approve",
                        )}
                        submitLabel="Approve"
                        className="[&_button]:bg-emerald-600 [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold [&_button]:text-white [&_button]:hover:bg-emerald-500"
                      />
                      <ActionForm
                        action={decideJudgeApplicationAction.bind(
                          null,
                          eventId,
                          application.id,
                          "reject",
                        )}
                        submitLabel="Reject"
                        className="[&_button]:bg-white [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold [&_button]:text-slate-600 [&_button]:ring-1 [&_button]:ring-inset [&_button]:ring-slate-300"
                      />
                    </>
                  ) : application.status === "approved" ? (
                    <ActionForm
                      action={deactivateJudgeAction.bind(
                        null,
                        eventId,
                        application.userId,
                      )}
                      submitLabel="Revoke"
                      className="[&_button]:bg-white [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold [&_button]:text-slate-600 [&_button]:ring-1 [&_button]:ring-inset [&_button]:ring-slate-300"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Rubrics</h2>
          {doc.rubrics.length > 0 ? (
            <Badge tone="slate">
              {doc.rubrics.length} rubric{doc.rubrics.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        <div className="mb-4 rounded-md border border-dashed border-slate-300 p-4">
          <h3 className="mb-3 text-sm font-semibold">Create a rubric</h3>
          <ActionForm
            action={createRubricAction.bind(null, eventId)}
            submitLabel="Create rubric"
          >
            <label className="block text-sm font-medium">
              Rubric name
              <input
                type="text"
                name="name"
                required
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
          </ActionForm>
        </div>
        {doc.rubrics.length === 0 ? (
          <p className="text-sm text-slate-500">No rubrics yet.</p>
        ) : (
          <ul className="space-y-4">
            {doc.rubrics.map((rubric) => (
              <li
                key={rubric.id}
                className="rounded-xl border border-slate-200 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {rubric.name}{" "}
                      <span className="text-xs text-slate-500">
                        v{rubric.version}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Weight sum: {rubric.weightSum}
                      {rubric.active ? (
                        <Badge tone="emerald" className="ml-2">
                          Active
                        </Badge>
                      ) : null}
                    </p>
                  </div>
                  {!rubric.active ? (
                    <ActionForm
                      action={activateRubricAction.bind(
                        null,
                        eventId,
                        rubric.id,
                      )}
                      submitLabel="Activate"
                    />
                  ) : null}
                </div>
                {rubric.criteria.length ? (
                  <ul className="mt-3 space-y-1 text-sm text-slate-600">
                    {rubric.criteria.map((criterion) => (
                      <li key={criterion.id}>
                        {criterion.name}
                        {criterion.optional ? (
                          <span className="text-slate-400"> (optional)</span>
                        ) : null}
                        {" "}— weight {criterion.weight}, range{" "}
                        {criterion.minScore}–{criterion.maxScore}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    No criteria yet.
                  </p>
                )}
                <div className="mt-4 rounded-md border border-dashed border-slate-300 p-4">
                  <h4 className="mb-2 text-sm font-medium">
                    Add criterion to “{rubric.name}”
                  </h4>
                  <ActionForm
                    action={addCriterionAction.bind(
                      null,
                      eventId,
                      rubric.id,
                    )}
                    submitLabel="Add criterion"
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-sm font-medium">
                        Criterion name
                        <input
                          type="text"
                          name="name"
                          required
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                        />
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <label className="block text-sm font-medium">
                          Weight
                          <input
                            type="number"
                            name="weight"
                            required
                            step="any"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          Min
                          <input
                            type="number"
                            name="minScore"
                            required
                            step="any"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        </label>
                        <label className="block text-sm font-medium">
                          Max
                          <input
                            type="number"
                            name="maxScore"
                            required
                            step="any"
                            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                          />
                        </label>
                      </div>
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        id={`optional-${rubric.id}`}
                        type="checkbox"
                        name="optional"
                        value="on"
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <label
                        htmlFor={`optional-${rubric.id}`}
                        className="text-sm text-slate-600"
                      >
                        Optional (judges may skip)
                      </label>
                    </div>
                    </div>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Judge assignments</h2>
          {doc.assignments.length > 0 ? (
            <Badge tone="slate">{doc.assignments.length} assigned</Badge>
          ) : null}
        </div>
        {doc.judges.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">
            No judges in this event yet.
          </p>
        ) : doc.projects.length === 0 ? (
          <p className="mb-4 text-sm text-slate-500">
            No projects to assign yet.
          </p>
        ) : (
          <div className="mb-4 rounded-md border border-dashed border-slate-300 p-4">
            <h3 className="mb-3 text-sm font-semibold">Assign a judge</h3>
            <ActionForm
              action={assignJudgeAction.bind(null, eventId)}
              submitLabel="Assign judge"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  Judge
                  <select
                    name="judgeId"
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {doc.judges.map((judge) => (
                      <option key={judge.userId} value={judge.userId}>
                        {judge.displayName} ({judge.email})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium">
                  Project
                  <select
                    name="projectId"
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {doc.projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title} ({project.teamName})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </ActionForm>
          </div>
        )}
        {doc.assignments.length === 0 ? (
          <p className="text-sm text-slate-500">No assignments yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4 font-medium">Judge</th>
                <th className="py-2 pr-4 font-medium">Project</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Submitted</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {doc.assignments.map((item) => (
                <tr key={item.id} className="border-b">
                  <td className="py-2 pr-4">{item.judgeName}</td>
                  <td className="py-2 pr-4">{item.projectTitle}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={ASSIGNMENT_STATUS_TONE[item.status] ?? "slate"}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </Badge>
                  </td>
                  <td className="py-2 pr-4">{formatDate(item.submittedAt)}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {item.status === "ASSIGNED" ? (
                        <ActionForm
                          action={unassignJudgeAction.bind(
                            null,
                            eventId,
                            item.id,
                          )}
                          submitLabel="Unassign"
                          className="[&_button]:mt-0 [&_button]:bg-slate-100 [&_button]:text-slate-600 [&_button]:hover:bg-red-50 [&_button]:hover:text-red-600"
                        />
                      ) : null}
                      {item.status === "SUBMITTED" ? (
                        <ActionForm
                          action={lockEvaluationAction.bind(
                            null,
                            eventId,
                            item.id,
                          )}
                          submitLabel="Lock"
                          className="[&_button]:mt-0 [&_button]:bg-emerald-600 [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold [&_button]:text-white [&_button]:hover:bg-emerald-500"
                        />
                      ) : null}
                      {item.status === "LOCKED" ? (
                        <Badge testId="assignment-locked-label" tone="indigo">
                          Locked
                        </Badge>
                      ) : null}
                      {item.status === "IN_PROGRESS" ? (
                        <span className="text-xs text-slate-400">
                          In progress
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Rankings &amp; publication</h2>
          {doc.snapshots.length > 0 ? (
            <Badge tone="slate">
              {doc.snapshots.length} snapshot
              {doc.snapshots.length === 1 ? "" : "s"}
            </Badge>
          ) : null}
        </div>
        {doc.event.state === "JUDGING" ? (
          <div className="flex flex-wrap items-center gap-3">
            <ActionForm
              action={lockAllSubmissionsAction.bind(null, eventId)}
              submitLabel="Lock submitted evaluations"
            />
          </div>
        ) : null}
        {canRunRanking(doc.event.state) ? (
          <div className="flex flex-wrap items-center gap-3">
            <ActionForm
              action={generateRankingAction.bind(null, eventId)}
              submitLabel="Generate ranking snapshot"
            />
          </div>
        ) : null}
        {!doc.publishedRankingSnapshotId &&
        (doc.event.state === "RESULTS_READY" || doc.event.state === "PUBLISHED")
          ? (
            <p
              data-testid="results-missing-warning"
              className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
            >
              This event is {EVENT_STATE_LABEL[doc.event.state]?.toLowerCase()}{" "}
              but no results have been published. Generate a ranking snapshot
              and publish it so participants can see their scores.
            </p>
          )
          : null}
        {doc.allEvaluationsLocked ? (
          <p
            data-testid="all-locked-note"
            className="mt-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600"
          >
            All evaluations are locked.
          </p>
        ) : null}
        {doc.snapshots.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No ranking snapshots generated yet.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {doc.snapshots.map((snapshot) => (
              <li
                key={snapshot.id}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    Ranking snapshot{" "}
                    <span className="text-slate-500">
                      (v{snapshot.rankingVersion})
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Generated {formatDate(snapshot.generatedAt)}
                    {snapshot.publishedAt
                      ? ` · published ${formatDate(snapshot.publishedAt)}`
                      : " · not published"}
                  </p>
                </div>
                {snapshot.publishedAt ? (
                  <Badge tone="emerald">Published</Badge>
                ) : canRunRanking(doc.event.state) ? (
                  <ActionForm
                    action={publishRankingAction.bind(
                      null,
                      eventId,
                      snapshot.id,
                    )}
                    submitLabel="Publish results"
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {results ? (
          <div className="mt-6 border-t border-slate-200 pt-4">
            <h3 className="text-base font-semibold">Latest scores</h3>
            <ResultsMeta results={results} />
            <ResultsTable results={results} />
          </div>
        ) : null}
      </section>

      <Collapsible
        title="Certificates"
        meta={
          <Badge tone={doc.certificatesCount > 0 ? "emerald" : "slate"}>
            {doc.certificatesCount} issued
          </Badge>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">
            Issued certificates are public via shareable links.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <ActionForm
              action={issueCertificatesAction.bind(null, eventId)}
              submitLabel="Issue certificates"
              className="[&_button]:mt-0"
            />
            {doc.certificatesCount > 0 ? (
              <>
                <ActionForm
                  action={revokeCertificatesAction.bind(null, eventId)}
                  submitLabel="Revoke all"
                  className="[&_button]:mt-0 [&_button]:bg-slate-100 [&_button]:text-slate-600 [&_button]:hover:bg-red-50 [&_button]:hover:text-red-600"
                />
                <Link
                  href={`/events/${eventId}/certificates`}
                  className="self-center text-sm font-medium text-blue-600 hover:underline"
                >
                  Open certificates
                </Link>
              </>
            ) : null}
          </div>
        </div>
        {doc.certificatesCount === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No certificates yet. Issuing becomes available once results are
            ready.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {doc.certificates.map((certificate) => (
              <li
                key={certificate.id}
                className="flex items-center justify-between gap-3 py-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {certificate.displayName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {certificate.projectTitle}
                    {certificate.teamName
                      ? ` · ${certificate.teamName}`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Badge testId="certificate-tier" tone="violet">
                    {CERTIFICATE_TIER_LABEL[certificate.tier as keyof typeof CERTIFICATE_TIER_LABEL] ??
                      certificate.tier}
                    {certificate.rank ? ` · #${certificate.rank}` : ""}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {formatDate(certificate.issuedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </main>
  );
}
