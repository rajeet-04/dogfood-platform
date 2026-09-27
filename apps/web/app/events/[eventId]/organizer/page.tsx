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
import { transitionEventAction } from "../../../../server/actions/event";
import {
  activateRubricAction,
  addCriterionAction,
  assignJudgeAction,
  createRubricAction,
} from "../../../../server/actions/rubric";
import {
  lockAllSubmissionsAction,
} from "../../../../server/actions/evaluation";
import {
  addMemberAction,
  changeMemberRoleAction,
  removeMemberAction,
} from "../../../../server/actions/members";
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

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
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
          >
            <input type="hidden" name="toState" value={nextState} />
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
        <h2 className="mb-4 text-lg font-semibold">Members</h2>
        <div className="mb-4 rounded-md border border-dashed border-slate-300 p-4">
          <h3 className="mb-3 text-sm font-semibold">
            Add a member by email
          </h3>
          <ActionForm
            action={addMemberAction.bind(null, eventId)}
            submitLabel="Add member"
          >
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm font-medium">
                Email
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="someone@example.com"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium">
                Role
                <select
                  name="role"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="PARTICIPANT">Participant</option>
                  <option value="JUDGE">Judge</option>
                </select>
              </label>
            </div>
          </ActionForm>
        </div>
        {doc.members.length === 0 ? (
          <p className="text-sm text-slate-500">No members yet.</p>
        ) : (
          <ul className="space-y-2">
            {doc.members.map((member) => (
              <li
                key={member.userId}
                data-testid="member-row"
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-slate-200 p-3"
              >
                <div>
                  <p className="text-sm font-medium">
                    {member.displayName}{" "}
                    <span className="text-xs text-slate-400">
                      ({member.email})
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Current role: {member.role}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActionForm
                    action={changeMemberRoleAction.bind(
                      null,
                      eventId,
                      member.userId,
                    )}
                    submitLabel="Update role"
                    submitDisabled={actor.userId === member.userId}
                    className="flex items-end gap-2"
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
                        {criterion.name} — weight {criterion.weight}, range{" "}
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
                <th className="py-2 font-medium">Submitted</th>
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
                  <td className="py-2">{formatDate(item.submittedAt)}</td>
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
    </main>
  );
}