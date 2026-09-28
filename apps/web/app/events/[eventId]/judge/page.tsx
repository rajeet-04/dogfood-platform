import Link from "next/link";
import { notFound } from "next/navigation";
import { isJudgingClosed } from "@dogfood/judging";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { Badge, type BadgeTone, Stat } from "../../../../components/badge";
import { Collapsible } from "../../../../components/collapsible";
import { NotAllowed } from "../../../../components/not-allowed";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../../../lib/event-flow";
import { requireActor } from "../../../../server/session";
import {
  getJudgeAssignmentDetail,
  getJudgeHome,
} from "../../../../server/read-models/judge";
import {
  reopenEvaluationAction,
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

const STATUS_TONE: Record<string, BadgeTone> = {
  ASSIGNED: "slate",
  IN_PROGRESS: "sky",
  SUBMITTED: "emerald",
  LOCKED: "indigo",
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
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {detail.item.project.currentRevision.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <Badge
              testId="assignment-status"
              tone={STATUS_TONE[detail.item.status] ?? "slate"}
            >
              {STATUS_LABEL[detail.item.status] ?? detail.item.status}
            </Badge>
            <span className="text-xs">Assigned {formatDate(detail.item.assignedAt)}</span>
          </div>
        </div>

        <Collapsible
          title="Project details"
          meta={
            <Badge tone="slate">
              {detail.item.project.state} ·{" "}
              {detail.item.project.currentRevision.techTags.length} tags
            </Badge>
          }
        >
          <p className="text-sm whitespace-pre-wrap text-slate-600">
            {detail.item.project.currentRevision.description}
          </p>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <Stat
              label="Tagline"
              value={detail.item.project.currentRevision.tagline || "—"}
            />
            <Stat
              label="Repository"
              value={
                detail.item.project.currentRevision.repositoryUrl ? (
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
                )
              }
            />
            <Stat
              label="Submitted"
              value={formatDate(detail.item.project.submittedAt)}
            />
            <Stat label="State" value={detail.item.project.state} />
          </dl>
          {detail.item.project.currentRevision.techTags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.item.project.currentRevision.techTags.map((tag) => (
                <Badge key={tag} tone="slate">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
        </Collapsible>

        <section
          className="mt-6 rounded-2xl border border-slate-200 bg-white p-6"
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
              judgingClosed={isJudgingClosed(detail.event.state)}
            />
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <div>
        <p className="text-sm text-slate-500">
          <Link href={`/events/${home.event.id}`} className="hover:underline">
            {home.event.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">Judge queue</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Badge tone={EVENT_STATE_TONE[home.event.state] ?? "slate"}>
            {EVENT_STATE_LABEL[home.event.state] ?? home.event.state}
          </Badge>
          <span className="text-xs">
            {home.completedCount} of {home.queue.length} complete
          </span>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                <tr key={item.assignmentId} className="border-b last:border-0">
                  <td className="px-6 py-3 font-medium">
                    {item.project.currentRevision.title}
                  </td>
                  <td className="px-6 py-3">
                    <Badge
                      testId={`queue-status-${item.status}`}
                      tone={STATUS_TONE[item.status] ?? "slate"}
                    >
                      {STATUS_LABEL[item.status] ?? item.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {formatDate(item.assignedAt)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <Link
                      href={`/events/${eventId}/judge?assignment=${item.assignmentId}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {item.status === "LOCKED"
                        ? "View"
                        : item.status === "SUBMITTED"
                          ? "Re-evaluate"
                          : "Evaluate"}
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
  judgingClosed,
}: {
  eventId: string;
  assignmentId: string;
  detail: NonNullable<Awaited<ReturnType<typeof getJudgeAssignmentDetail>>["evaluation"]>;
  judgingClosed: boolean;
}) {
  const locked = detail.state === "LOCKED";
  const submitted = detail.state === "SUBMITTED";
  const readOnly = locked || judgingClosed;
  return (
    <div>
      {locked ? (
        <p
          data-testid="locked-banner"
          className="mb-4 rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600"
        >
          This evaluation is locked and can no longer be modified.
        </p>
      ) : judgingClosed ? (
        <p
          data-testid="judging-closed-banner"
          className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
        >
          Results have already been generated for this event, so evaluations
          are read-only.
        </p>
      ) : submitted ? (
        <div
          data-testid="submitted-banner"
          className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800"
        >
          <p className="font-medium">
            Submitted{detail.submittedAt ? ` on ${formatDate(detail.submittedAt)}` : ""}.
          </p>
          <p className="mt-1">
            Your scores are saved. Re-evaluate to change them before results
            are generated.
          </p>
          <ActionForm
            action={reopenEvaluationAction.bind(null, eventId, assignmentId)}
            submitLabel="Re-evaluate"
            className="[&_button]:mt-3 [&_button]:bg-emerald-600 [&_button]:text-white [&_button]:hover:bg-emerald-500"
          />
        </div>
      ) : (
        <p className="mb-4 text-sm text-slate-500">
          Score each criterion within its allowed range.
        </p>
      )}
      <ActionForm
        action={submitEvaluationAction.bind(null, eventId, assignmentId)}
        submitLabel={readOnly ? "Read only" : "Submit evaluation"}
        submitDisabled={readOnly}
      >
        {detail.criteria.map((criterion) => (
          <fieldset
            key={criterion.criterionId}
            className="mb-4 rounded-md border border-slate-200 p-4"
          >
            <legend className="px-1 text-sm font-medium">
              {criterion.name}
              {criterion.optional ? (
                <span className="text-slate-400"> (optional)</span>
              ) : null}{" "}
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
                required={!criterion.optional}
                disabled={readOnly}
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
                disabled={readOnly}
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
            disabled={readOnly}
            defaultValue={detail.overallComment ?? ""}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </label>
        {readOnly ? (
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