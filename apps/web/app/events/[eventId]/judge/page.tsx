import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { isJudgingClosed } from "@dogfood/judging";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { Badge, type BadgeTone } from "../../../../components/badge";
import { Collapsible } from "../../../../components/collapsible";
import { NotAllowed } from "../../../../components/not-allowed";
import { Alert } from "../../../../components/ui/alert";
import { Card, CardBody, CardHeader } from "../../../../components/ui/card";
import { EmptyStatePanel } from "../../../../components/ui/empty-state";
import { Field, Input, Textarea } from "../../../../components/ui/input";
import { Page, PageHeader } from "../../../../components/ui/page-header";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../../../lib/event-flow";
import { isUuidId } from "../../../../lib/ids";
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
  if (!isUuidId(eventId)) notFound();
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
    const revision = detail.item.project.currentRevision;
    return (
      <Page width="narrow">
        <Link
          href={`/events/${eventId}/judge`}
          className="mb-3 inline-flex items-center gap-1.5 rounded-xs text-small font-medium text-fg-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft aria-hidden="true" className="size-3.5" />
          Back to queue
        </Link>

        <PageHeader
          title={revision.title}
          description={revision.tagline || undefined}
          meta={
            <>
              <Badge
                testId="assignment-status"
                tone={STATUS_TONE[detail.item.status] ?? "slate"}
              >
                {STATUS_LABEL[detail.item.status] ?? detail.item.status}
              </Badge>
              <span className="text-caption text-fg-subtle">
                Assigned {formatDate(detail.item.assignedAt)}
              </span>
            </>
          }
        />

        <div className="mt-6 space-y-5">
          <Collapsible
            title="Project details"
            defaultOpen
            meta={
              <Badge tone="slate">
                {detail.item.project.state} · {revision.techTags.length} tags
              </Badge>
            }
          >
            <p className="text-small whitespace-pre-wrap text-fg-muted">
              {revision.description}
            </p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md bg-surface-sunken/60 px-3 py-2">
                <dt className="text-caption text-fg-subtle">Tagline</dt>
                <dd className="text-small text-fg">
                  {revision.tagline || "—"}
                </dd>
              </div>
              <div className="rounded-md bg-surface-sunken/60 px-3 py-2">
                <dt className="text-caption text-fg-subtle">Repository</dt>
                <dd className="text-small text-fg">
                  {revision.repositoryUrl ? (
                    <a
                      href={revision.repositoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:text-accent-hover hover:underline"
                    >
                      Link
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
              <div className="rounded-md bg-surface-sunken/60 px-3 py-2">
                <dt className="text-caption text-fg-subtle">Submitted</dt>
                <dd className="text-small text-fg">
                  {formatDate(detail.item.project.submittedAt)}
                </dd>
              </div>
              <div className="rounded-md bg-surface-sunken/60 px-3 py-2">
                <dt className="text-caption text-fg-subtle">State</dt>
                <dd className="text-small text-fg">
                  {detail.item.project.state}
                </dd>
              </div>
            </dl>
            {revision.techTags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {revision.techTags.map((tag) => (
                  <Badge key={tag} tone="slate">
                    {tag}
                  </Badge>
                ))}
              </div>
            ) : null}
          </Collapsible>

          <Card data-testid="evaluation-panel">
            <CardHeader
              title="Evaluation"
              description="Your scores stay private until results are published."
            />
            <CardBody>
              {!detail.evaluation ? (
                <div>
                  <p className="mb-3 text-small text-fg-subtle">
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
            </CardBody>
          </Card>
        </div>
      </Page>
    );
  }

  return (
    <Page width="narrow">
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: home.event.name, href: `/events/${home.event.id}` },
        ]}
        title="Judge queue"
        description="Evaluate the projects assigned to you before the organizer generates results."
        meta={
          <>
            <Badge tone={EVENT_STATE_TONE[home.event.state] ?? "slate"}>
              {EVENT_STATE_LABEL[home.event.state] ?? home.event.state}
            </Badge>
            <span className="text-caption text-fg-subtle">
              {home.completedCount} of {home.queue.length} complete
            </span>
          </>
        }
      />

      <div className="mt-6">
        {home.queue.length >= 2 ? (
          <Link
            href={`/events/${eventId}/judge/pairwise`}
            className="mb-4 inline-flex min-h-10 items-center rounded-md border border-line bg-surface px-3 text-small font-medium text-fg transition-colors hover:border-accent hover:text-accent"
          >
            Compare assigned projects
          </Link>
        ) : null}
        {home.queue.length === 0 ? (
          <EmptyStatePanel
            icon="inbox"
            title="You have no assignments in this event."
            description="The organizer assigns projects to judges once submissions close."
          />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <caption className="sr-only">Projects assigned to you</caption>
                <thead>
                  <tr className="border-b border-line text-left text-caption text-fg-subtle">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Project
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Status
                    </th>
                    <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
                      Assigned
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {home.queue.map((item) => (
                    <tr
                      key={item.assignmentId}
                      className="border-b border-line-subtle last:border-0"
                    >
                      <td className="px-4 py-2.5 font-medium text-fg">
                        {item.project.currentRevision.title}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge
                          testId={`queue-status-${item.status}`}
                          tone={STATUS_TONE[item.status] ?? "slate"}
                        >
                          {STATUS_LABEL[item.status] ?? item.status}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-2.5 text-fg-subtle sm:table-cell">
                        {formatDate(item.assignedAt)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Link
                          href={`/events/${eventId}/judge?assignment=${item.assignmentId}`}
                          className="font-medium text-accent hover:text-accent-hover hover:underline"
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
            </div>
          </Card>
        )}
      </div>
    </Page>
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
        <Alert
          tone="neutral"
          testId="locked-banner"
          className="mb-4"
          title="This evaluation is locked"
        >
          It can no longer be modified.
        </Alert>
      ) : judgingClosed ? (
        <Alert tone="warning" testId="judging-closed-banner" className="mb-4">
          Results have already been generated for this event, so evaluations are
          read-only.
        </Alert>
      ) : submitted ? (
        <Alert
          tone="success"
          testId="submitted-banner"
          className="mb-4 items-start"
          title={`Submitted${detail.submittedAt ? ` on ${formatDate(detail.submittedAt)}` : ""}.`}
        >
          <p>
            Your scores are saved. Re-evaluate to change them before results are
            generated.
          </p>
          <ActionForm
            action={reopenEvaluationAction.bind(null, eventId, assignmentId)}
            submitLabel="Re-evaluate"
            className="mt-3"
          />
        </Alert>
      ) : (
        <p className="mb-4 text-small text-fg-subtle">
          Score each criterion within its allowed range.
        </p>
      )}
      <ActionForm
        action={submitEvaluationAction.bind(null, eventId, assignmentId)}
        submitLabel={readOnly ? "Read only" : "Submit evaluation"}
        submitDisabled={readOnly}
      >
        <div className="space-y-4">
          {detail.criteria.map((criterion) => (
            <fieldset
              key={criterion.criterionId}
              className="rounded-lg border border-line p-4"
            >
              <legend className="px-1 text-small font-medium text-fg">
                {criterion.name}
                {criterion.optional ? (
                  <span className="text-fg-faint"> (optional)</span>
                ) : null}{" "}
                <span className="text-caption font-normal text-fg-subtle">
                  (weight {criterion.weight}, {criterion.minScore}–
                  {criterion.maxScore})
                </span>
              </legend>
              <div className="space-y-3">
                <Field label="Score">
                  <Input
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
                    className="max-w-32"
                  />
                </Field>
                <Field label="Comment">
                  <Textarea
                    name={`comment:${criterion.criterionId}`}
                    rows={2}
                    disabled={readOnly}
                    defaultValue={criterion.comment ?? ""}
                  />
                </Field>
              </div>
            </fieldset>
          ))}
        </div>
        <Field label="Overall comment" className="mt-4 block">
          <Textarea
            name="overallComment"
            rows={3}
            disabled={readOnly}
            defaultValue={detail.overallComment ?? ""}
          />
        </Field>
        {readOnly ? (
          <div className="mt-4 rounded-md bg-surface-sunken/60 p-3.5">
            <p className="text-caption font-semibold text-fg-subtle">
              Your recorded scores
            </p>
            <ul className="mt-1.5 space-y-1">
              {detail.criteria.map((criterion) => (
                <li key={criterion.criterionId} className="text-small text-fg-muted">
                  <span className="font-medium text-fg">{criterion.name}:</span>{" "}
                  {criterion.score === null ? "not scored" : String(criterion.score)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </ActionForm>
    </div>
  );
}
