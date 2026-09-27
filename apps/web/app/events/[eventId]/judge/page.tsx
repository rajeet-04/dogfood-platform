import Link from "next/link";
import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { NotAllowed } from "../../../../components/not-allowed";
import { EVENT_STATE_LABEL } from "../../../../lib/event-flow";
import { requireActor } from "../../../../server/session";
import {
  getJudgeAssignmentDetail,
  getJudgeHome,
} from "../../../../server/read-models/judge";
import {
  startEvaluationAction,
  submitEvaluationAction,
} from "../../../../server/actions/evaluation";

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

export default async function JudgePage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ assignment?: string }>;
}) {
  const { eventId } = await params;
  const { assignment } = await searchParams;
  const actor = await requireActor();

  let home;
  try {
    home = await getJudgeHome(actor, eventId);
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

  if (assignment) {
    let detail;
    try {
      detail = await getJudgeAssignmentDetail(actor, eventId, assignment);
    } catch (err) {
      if (err instanceof DogfoodError && err.code === "NOT_FOUND") notFound();
      throw err;
    }
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="mb-6">
          <p className="text-sm text-slate-500">
            <Link href={`/events/${eventId}/judge`} className="hover:underline">
              ← Back to queue
            </Link>
          </p>
          <h1 className="mt-2 text-2xl font-bold">
            {detail.item.project.currentRevision.title}
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <span
              data-testid="assignment-status"
              className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium"
            >
              {STATUS_LABEL[detail.item.status] ?? detail.item.status}
            </span>
            <span>Assigned {formatDate(detail.item.assignedAt)}</span>
          </div>
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-3 font-semibold">Project</h2>
          <p className="text-sm text-slate-600">
            {detail.item.project.currentRevision.description}
          </p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium">Tagline</dt>
              <dd className="text-slate-600">
                {detail.item.project.currentRevision.tagline || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Repository</dt>
              <dd className="text-slate-600">
                {detail.item.project.currentRevision.repositoryUrl ? (
                  <a
                    href={detail.item.project.currentRevision.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Link
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="font-medium">Submitted</dt>
              <dd className="text-slate-600">
                {formatDate(detail.item.project.submittedAt)}
              </dd>
            </div>
            <div>
              <dt className="font-medium">State</dt>
              <dd className="text-slate-600">{detail.item.project.state}</dd>
            </div>
          </dl>
        </section>

        <section
          className="mt-6 rounded-lg border border-slate-200 bg-white p-6"
          data-testid="evaluation-panel"
        >
          <h2 className="mb-4 text-lg font-semibold">Evaluation</h2>
          {!detail.evaluation ? (
            <div>
              <p className="mb-3 text-sm text-slate-500">
                Start the evaluation to open the scoring form.
              </p>
              <ActionForm
                action={startEvaluationAction.bind(null, eventId, assignment)}
                submitLabel="Start evaluation"
              />
            </div>
          ) : (
            <EvaluationForm
              eventId={eventId}
              assignmentId={assignment}
              detail={detail.evaluation}
            />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-slate-500">
          <Link href={`/events/${home.event.id}`} className="hover:underline">
            {home.event.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold">Judge queue</h1>
        <p className="mt-2 text-sm text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            {EVENT_STATE_LABEL[home.event.state] ?? home.event.state}
          </span>
          <span className="ml-2">
            {home.completedCount} of {home.queue.length} complete
          </span>
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white">
        {home.queue.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">
            You have no assignments in this event.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="px-6 py-3 font-medium">Project</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Assigned</th>
                <th className="px-6 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {home.queue.map((item) => (
                <tr key={item.assignmentId} className="border-b">
                  <td className="px-6 py-3 font-medium">
                    {item.project.currentRevision.title}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      data-testid={`queue-status-${item.status}`}
                      className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium"
                    >
                      {STATUS_LABEL[item.status] ?? item.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(item.assignedAt)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/events/${eventId}/judge?assignment=${item.assignmentId}`}
                      className="text-blue-600 hover:underline"
                    >
                      {item.status === "LOCKED" ? "View" : "Evaluate"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

function EvaluationForm({
  eventId,
  assignmentId,
  detail,
}: {
  eventId: string;
  assignmentId: string;
  detail: NonNullable<Awaited<ReturnType<typeof getJudgeAssignmentDetail>>["evaluation"]>;
}) {
  const locked = detail.state === "LOCKED";
  return (
    <div>
      {locked ? (
        <p
          data-testid="locked-banner"
          className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600"
        >
          This evaluation is locked and can no longer be modified.
        </p>
      ) : (
        <p className="mb-4 text-sm text-slate-500">
          Score each criterion within its allowed range.
        </p>
      )}
      <ActionForm
        action={submitEvaluationAction.bind(null, eventId, assignmentId)}
        submitLabel={locked ? "Read only" : "Submit evaluation"}
        submitDisabled={locked}
      >
        {detail.criteria.map((criterion) => (
          <fieldset
            key={criterion.criterionId}
            className="mb-4 rounded-md border border-slate-200 p-4"
          >
            <legend className="px-1 text-sm font-medium">
              {criterion.name}{" "}
              <span className="text-slate-500">
                (weight {criterion.weight}, {criterion.minScore}–
                {criterion.maxScore})
              </span>
            </legend>
            <label className="mt-2 block text-sm font-medium">
              Score
              <input
                type="number"
                name={`score:${criterion.criterionId}`}
                min={criterion.minScore}
                max={criterion.maxScore}
                step="any"
                required
                disabled={locked}
                defaultValue={
                  criterion.score === null ? "" : String(criterion.score)
                }
                data-criterion-id={criterion.criterionId}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </label>
            <label className="mt-2 block text-sm font-medium">
              Comment
              <textarea
                name={`comment:${criterion.criterionId}`}
                rows={2}
                disabled={locked}
                defaultValue={criterion.comment ?? ""}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              />
            </label>
          </fieldset>
        ))}
        <label className="block text-sm font-medium">
          Overall comment
          <textarea
            name="overallComment"
            rows={3}
            disabled={locked}
            defaultValue={detail.overallComment ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </label>
        {locked ? (
          <div className="mt-3">
            {detail.criteria.map((criterion) => (
              <p key={criterion.criterionId} className="text-sm text-slate-600">
                <span className="font-medium">{criterion.name}:</span>{" "}
                {criterion.score === null
                  ? "not scored"
                  : String(criterion.score)}
              </p>
            ))}
          </div>
        ) : null}
      </ActionForm>
    </div>
  );
}