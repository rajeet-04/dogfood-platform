import Link from "next/link";
import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { NotAllowed } from "../../../../components/not-allowed";
import {
  EVENT_STATE_LABEL,
  nextEventState,
} from "../../../../lib/event-flow";
import { requireActor } from "../../../../server/session";
import { getOrganizerDocument } from "../../../../server/read-models/organizer";
import { updateRegistrationWindowAction } from "../../../../server/actions/event";
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

const ROLE_PILL: Record<string, string> = {
  PARTICIPANT: "bg-sky-50 text-sky-700",
  JUDGE: "bg-indigo-50 text-indigo-700",
  ORGANIZER: "bg-violet-50 text-violet-700",
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href={`/events/${doc.event.id}`} className="hover:underline">
              {doc.event.name}
            </Link>
          </p>
          <h1 className="text-2xl font-bold">Organizer dashboard</h1>
          <p className="mt-2 text-sm text-slate-500">
            <span
              data-testid="event-state"
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium"
            >
              {EVENT_STATE_LABEL[doc.event.state] ?? doc.event.state}
            </span>
          </p>
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

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Judging progress</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
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
          <div className="col-span-2">
            <dt className="font-medium text-slate-500">Completed</dt>
            <dd className="text-2xl font-bold" data-testid="coverage-completed">
              {coverage.completed} / {coverage.total}
            </dd>
          </div>
        </dl>
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
            Scores are visible after results are ready.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">Registration window</h2>
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
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold">Submissions</h2>
          <ActionForm
            action={lockAllProjectsAction.bind(null, eventId)}
            submitLabel="Lock all submissions"
            className="[&_button]:mt-0 [&_button]:rounded-md [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold"
          />
        </div>
        {doc.projects.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No projects yet.
          </p>
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
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                    {PROJECT_STATE_LABEL[project.state] ?? project.state}
                  </span>
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
      </section>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold">Members</h2>
          <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
            {doc.members.length} total
          </span>
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
                <option value="PARTICIPANT">Participant</option>
                <option value="JUDGE">Judge</option>
              </select>
            </label>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">
            Invite someone by email, or let participants self-join from the
            event page while registration is open.
          </p>
        </div>

        {doc.members.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-slate-500">
            No members yet.
          </p>
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
                  <span
                    data-testid="member-role"
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      ROLE_PILL[member.role] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {ROLE_LABEL[member.role] ?? member.role}
                  </span>
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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-semibold">Judge applications</h2>
          <span className="text-sm text-slate-500">
            {doc.applications.length} total
          </span>
        </div>
        {doc.applications.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            No judge applications yet.
          </p>
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
                    <p className="mt-1 whitespace-pre-wrap text-xs text-slate-500">
                      {application.rationale}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-400">
                    Applied {formatDate(application.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <span
                    data-testid="application-status"
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {JUDGE_APPLICATION_STATUS_LABEL[
                      application.status as keyof typeof JUDGE_APPLICATION_STATUS_LABEL
                    ] ?? application.status}
                  </span>
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
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Rubrics</h2>
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
                className="rounded-md border border-slate-200 p-4"
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
                        <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                          Active
                        </span>
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
                        {criterion.name}{" "}
                        {criterion.optional ? (
                          <span className="text-slate-400">(optional)</span>
                        ) : null}{" "}
                        — weight {criterion.weight}, range{" "}
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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Judge assignments</h2>
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
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="py-2 pr-4">{formatDate(item.submittedAt)}</td>
                  <td className="py-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Rankings &amp; publication</h2>
        {doc.event.state === "JUDGING" ? (
          <div className="flex flex-wrap items-center gap-3">
            <ActionForm
              action={lockAllSubmissionsAction.bind(null, eventId)}
              submitLabel="Lock submitted evaluations"
            />
            <ActionForm
              action={generateRankingAction.bind(null, eventId)}
              submitLabel="Generate ranking snapshot"
            />
          </div>
        ) : null}
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
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                    Published
                  </span>
                ) : doc.event.state === "JUDGING" ? (
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
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Certificates</h2>
            <p className="mt-1 text-sm text-slate-500">
              {doc.certificatesCount} certificate
              {doc.certificatesCount === 1 ? "" : "s"} issued for this event.
              Issued certificates are public via shareable links.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ActionForm
              action={issueCertificatesAction.bind(null, eventId)}
              submitLabel="Issue certificates"
            />
            {doc.certificatesCount > 0 ? (
              <>
                <ActionForm
                  action={revokeCertificatesAction.bind(null, eventId)}
                  submitLabel="Revoke all"
                  className="[&_button]:bg-slate-100 [&_button]:text-slate-600 [&_button]:hover:bg-red-50 [&_button]:hover:text-red-600"
                />
                <Link
                  href={`/events/${eventId}/certificates`}
                  className="text-sm font-medium text-blue-600 hover:underline"
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
                  <span
                    data-testid="certificate-tier"
                    className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600"
                  >
                    {CERTIFICATE_TIER_LABEL[certificate.tier as keyof typeof CERTIFICATE_TIER_LABEL] ??
                      certificate.tier}
                    {certificate.rank ? ` · #${certificate.rank}` : ""}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDate(certificate.issuedAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}