import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";
import { canRunRanking } from "@dogfood/ranking";
import { CERTIFICATE_TIER_LABEL } from "@dogfood/certificates";
import { JUDGE_APPLICATION_STATUS_LABEL } from "@dogfood/applications";

import { ActionForm } from "../../../../components/action-form";
import { JudgeAssignmentPlanner } from "../../../../components/organizer/judge-assignment-planner";
import { JudgeInvitations } from "../../../../components/organizer/judge-invitations";
import { VotingSettings } from "../../../../components/organizer/voting-settings";
import {
  Badge,
  type BadgeTone,
  Progress,
} from "../../../../components/badge";
import { Collapsible } from "../../../../components/collapsible";
import { NotAllowed } from "../../../../components/not-allowed";
import {
  ResultsMeta,
  ResultsTable,
} from "../../../../components/results-table";
import { Alert } from "../../../../components/ui/alert";
import { ButtonLink } from "../../../../components/ui/button";
import {
  Card,
  CardBody,
  CardHeader,
} from "../../../../components/ui/card";
import { EmptyStatePanel } from "../../../../components/ui/empty-state";
import {
  AddPanel,
  Checkbox,
  Field,
  Input,
  Select,
  Textarea,
} from "../../../../components/ui/input";
import { Page, PageHeader } from "../../../../components/ui/page-header";
import { EventWindowFields } from "../../../../components/event-window-fields";
import {
  EVENT_ROLE_TONE,
  EVENT_STATE_LABEL,
  EVENT_STATE_TONE,
  nextEventState,
} from "../../../../lib/event-flow";
import { isUuidId } from "../../../../lib/ids";
import { toUtcLocalInput } from "../../../../lib/format";
import { requireActor } from "../../../../server/session";
import { getOrganizerDocument } from "../../../../server/read-models/organizer";
import { getEventResults } from "../../../../server/read-models/results";
import {
  transitionEventAction,
  updateEventDetailsAction,
  updateRegistrationWindowAction,
} from "../../../../server/actions/event";
import {
  deactivateJudgeAction,
  decideJudgeApplicationAction,
} from "../../../../server/actions/applications";
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
import {
  generateRankingAction,
  publishRankingAction,
} from "../../../../server/actions/ranking";
import {
  addQuestionAction,
  addTrackAction,
  moveQuestionAction,
  moveTrackAction,
  addPrizeAction,
  removePrizeAction,
  updatePrizeAction,
  removeQuestionAction,
  removeTrackAction,
  updateQuestionAction,
  updateTrackAction,
} from "../../../../server/actions/submission-settings";

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

export default async function OrganizerPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!isUuidId(eventId)) notFound();
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
    <Page width="wide">
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: doc.event.name, href: `/events/${doc.event.id}` },
        ]}
        title="Organizer dashboard"
        description="Run the event end to end: members, submissions, judging, results and certificates."
        meta={
          <>
            <Badge
              testId="event-state"
              tone={EVENT_STATE_TONE[doc.event.state] ?? "slate"}
            >
              {EVENT_STATE_LABEL[doc.event.state] ?? doc.event.state}
            </Badge>
            <span className="text-caption text-fg-subtle">
              {doc.members.length} member{doc.members.length === 1 ? "" : "s"} ·{" "}
              {doc.projects.length} project{doc.projects.length === 1 ? "" : "s"}
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink href={`/events/${eventId}/organizer/webhooks`} variant="outline">
              Webhooks
            </ButtonLink>
            {nextState ? (
              <ActionForm
                action={transitionEventAction.bind(null, eventId)}
                submitLabel={`Advance to ${EVENT_STATE_LABEL[nextState]}`}
                submitVariant={nextState === "ARCHIVED" ? "destructive" : "primary"}
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
          </>
        }
      />

      <div className="mt-6 space-y-5">
        <Card>
          <CardHeader
            title="Judging progress"
            description="How much of the judging work is done."
          />
          <CardBody>
            <Progress
              value={coverage.completed}
              max={coverage.total}
              label="Judging completion"
              tone={coverage.total > 0 && coverage.completed === coverage.total
                ? "success"
                : "accent"}
            />
            <p className="mt-2 text-small text-fg-subtle">
              {coverage.completed} of {coverage.total} evaluations complete
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Assignments", coverage.total, "coverage-total"],
                ["In progress", coverage.inProgress, null],
                ["Submitted", coverage.submitted, null],
                ["Locked", coverage.locked, null],
              ].map(([label, value, testId]) => (
                <div
                  key={String(label)}
                  className="rounded-lg border border-line-subtle bg-surface-sunken px-3.5 py-3"
                >
                  <dt className="text-micro font-semibold tracking-[0.06em] text-fg-faint uppercase">
                    {label}
                  </dt>
                  <dd
                    data-testid={testId ?? undefined}
                    className="mt-1 text-heading font-semibold text-fg tabular"
                  >
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-small text-fg-subtle">
              Completed{" "}
              <span
                className="font-semibold text-fg"
                data-testid="coverage-completed"
              >
                {coverage.completed} / {coverage.total}
              </span>
            </p>
            <Alert tone="info" className="mt-4">
              Organizers can see every judge&rsquo;s raw scores at any stage in
              &ldquo;Judge assignments&rdquo;. Judges only ever see their own.
            </Alert>
          </CardBody>
        </Card>

        <VotingSettings eventId={eventId} />

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
              <span className="text-fg-faint">Nothing filled in yet</span>
            )
          }
        >
          <p className="mb-4 text-small text-fg-subtle">
            Everything here is shown publicly on the event page under
            &ldquo;About this event&rdquo;.
          </p>
          <ActionForm
            action={updateEventDetailsAction.bind(null, eventId)}
            submitLabel="Save details"
          >
            <div className="space-y-4">
              <Field label="Description">
                <Textarea
                  name="description"
                  rows={4}
                  defaultValue={doc.event.description ?? ""}
                  placeholder="What is this event about?"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Event website">
                  <Input
                    type="url"
                    name="websiteUrl"
                    defaultValue={doc.event.websiteUrl ?? ""}
                    placeholder="https://example.com"
                  />
                </Field>
                <Field
                  label="Maximum team size"
                  description="Leave empty for unlimited teams."
                >
                  <Input
                    type="number"
                    name="maxTeamSize"
                    min={2}
                    max={100}
                    defaultValue={doc.event.maxTeamSize ?? ""}
                    placeholder="Unlimited"
                  />
                </Field>
              </div>
              <Field label="Timeline">
                <Textarea
                  name="timeline"
                  rows={3}
                  defaultValue={doc.event.timeline ?? ""}
                  placeholder={"Registration opens\nSubmissions close\nJudging starts"}
                />
              </Field>
              <Field label="Schedule">
                <Textarea
                  name="schedule"
                  rows={3}
                  defaultValue={doc.event.schedule ?? ""}
                  placeholder={
                    "Day 1 · 09:00 Opening ceremony\nDay 1 · 13:00 Hacking starts"
                  }
                />
              </Field>
              <Field label="Rules">
                <Textarea
                  name="rules"
                  rows={4}
                  defaultValue={doc.event.rules ?? ""}
                  placeholder="Eligibility, judging criteria, code of conduct…"
                />
              </Field>
            </div>
          </ActionForm>
        </Collapsible>

        <Collapsible title="Prizes" meta={<Badge tone="slate">{doc.prizes.length} configured</Badge>}>
          <p className="mb-4 text-small text-fg-subtle">Add event-wide awards or associate a prize with one of the event tracks.</p>
          {doc.prizes.length ? <div className="mb-5 space-y-3">{doc.prizes.map((prize) => (
            <div key={prize.id} className="rounded-lg border border-line-subtle p-3">
              <ActionForm action={updatePrizeAction.bind(null, eventId, prize.id)} submitLabel="Save prize" layout="inline">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prize name"><Input name="name" required maxLength={120} defaultValue={prize.name} /></Field>
                  <Field label="Track"><Select name="trackId" defaultValue={prize.trackId ?? ""}><option value="">All tracks</option>{doc.tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</Select></Field>
                  <Field label="Amount"><Input name="amount" defaultValue={prize.amount ?? ""} placeholder="5000" /></Field>
                  <Field label="Currency"><Input name="currency" defaultValue={prize.currency ?? ""} placeholder="USD" maxLength={3} /></Field>
                  <Field label="Sort order"><Input type="number" name="sortOrder" min={0} defaultValue={prize.sortOrder} /></Field>
                  <Field label="Description"><Input name="description" defaultValue={prize.description ?? ""} maxLength={1000} /></Field>
                </div>
              </ActionForm>
              <ActionForm action={removePrizeAction.bind(null, eventId, prize.id)} submitLabel="Delete" submitVariant="destructive" submitSize="sm" className="mt-2" />
            </div>
          ))}</div> : <p className="mb-4 text-small text-fg-faint">No prizes configured yet.</p>}
          <ActionForm action={addPrizeAction.bind(null, eventId)} submitLabel="Add prize">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Prize name"><Input name="name" required maxLength={120} placeholder="First place" /></Field>
              <Field label="Track"><Select name="trackId" defaultValue=""><option value="">All tracks</option>{doc.tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}</Select></Field>
              <Field label="Amount"><Input name="amount" placeholder="5000" /></Field>
              <Field label="Currency"><Input name="currency" placeholder="USD" maxLength={3} /></Field>
              <Field label="Sort order"><Input type="number" name="sortOrder" min={0} defaultValue={0} /></Field>
              <Field label="Description"><Input name="description" maxLength={1000} /></Field>
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
          <p className="mb-4 text-small text-fg-subtle">
            The window during which participants can join and judges can apply.
            Times use UTC. Leave a boundary empty to disable it.
          </p>
          <ActionForm
            action={updateRegistrationWindowAction.bind(null, eventId)}
            submitLabel="Save window"
          >
            <EventWindowFields
              windows={["registration"]}
              values={{
                registrationOpensAt: toUtcLocalInput(doc.event.registrationOpensAt),
                registrationClosesAt: toUtcLocalInput(doc.event.registrationClosesAt),
              }}
            />
          </ActionForm>
        </Collapsible>

        <Collapsible
          title="Submission settings"
          meta={
            <>
              <Badge tone="slate">{doc.tracks.length} tracks</Badge>
              <Badge tone="slate">
                {doc.event.customQuestions.length} questions
              </Badge>
            </>
          }
          defaultOpen
        >
          <div className="grid gap-8 lg:grid-cols-2">
            <section aria-labelledby="event-tracks-heading" className="min-w-0">
              <div className="mb-3">
                <h3 id="event-tracks-heading" className="text-subheading font-semibold text-fg">
                  Tracks
                </h3>
                <p className="mt-0.5 text-caption text-fg-subtle">
                  Give participants a category to select for their submission.
                </p>
              </div>
              {doc.tracks.length ? (
                <ul className="mb-4 divide-y divide-line-subtle rounded-lg border border-line-subtle">
                  {doc.tracks.map((track, index) => (
                    <li
                      key={track.id}
                      className="flex flex-wrap items-start justify-between gap-3 px-3.5 py-3"
                    >
                      <ActionForm
                        action={updateTrackAction.bind(null, eventId, track.id)}
                        submitLabel="Save track"
                        className="min-w-0 flex-1 basis-48"
                      >
                        <Field label="Track name" required>
                          <Input name="name" required maxLength={100} defaultValue={track.name} />
                        </Field>
                      </ActionForm>
                      <div className="flex flex-wrap gap-2">
                        <ActionForm
                          action={moveTrackAction.bind(null, eventId, track.id, "UP")}
                          submitLabel={`Move track ${index + 1} up`}
                          submitVariant="outline"
                          submitSize="sm"
                          submitDisabled={index === 0}
                        />
                        <ActionForm
                          action={moveTrackAction.bind(null, eventId, track.id, "DOWN")}
                          submitLabel={`Move track ${index + 1} down`}
                          submitVariant="outline"
                          submitSize="sm"
                          submitDisabled={index === doc.tracks.length - 1}
                        />
                        <ActionForm
                          action={removeTrackAction.bind(null, eventId, track.id)}
                          submitLabel="Remove"
                          pendingLabel="Removing…"
                          submitVariant="outline"
                          submitSize="sm"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 rounded-lg border border-dashed border-line-strong px-3.5 py-3 text-small text-fg-subtle">
                  No tracks yet. Participants can submit without choosing one.
                </p>
              )}
              <AddPanel title="Add a track">
                <ActionForm
                  action={addTrackAction.bind(null, eventId)}
                  submitLabel="Add track"
                  pendingLabel="Adding…"
                >
                  <Field label="Track name" required>
                    <Input
                      name="name"
                      required
                      maxLength={100}
                      placeholder="e.g. Climate tech"
                    />
                  </Field>
                </ActionForm>
              </AddPanel>
            </section>

            <section aria-labelledby="custom-questions-heading" className="min-w-0">
              <div className="mb-3">
                <h3 id="custom-questions-heading" className="text-subheading font-semibold text-fg">
                  Project questions
                </h3>
                <p className="mt-0.5 text-caption text-fg-subtle">
                  Changing a public question to organizer-only hides existing answers. Making it public exposes answers only after participants save new revisions.
                </p>
              </div>
              {doc.event.customQuestions.length ? (
                <ul className="mb-4 divide-y divide-line-subtle rounded-lg border border-line-subtle">
                  {doc.event.customQuestions.map((question, index) => (
                    <li key={question.id} className="p-3.5">
                      <div className="mb-2 text-caption font-semibold text-fg-subtle">
                        Question {index + 1}
                      </div>
                      <div className="flex flex-wrap items-start gap-2">
                        <ActionForm
                          action={updateQuestionAction.bind(null, eventId, question.id)}
                          submitLabel="Save question"
                          pendingLabel="Saving…"
                          className="min-w-0 flex-1 basis-64"
                        >
                          <Field label="Prompt" required>
                            <Textarea
                              name="prompt"
                              rows={2}
                              required
                              maxLength={300}
                              defaultValue={question.prompt}
                            />
                          </Field>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <label className="flex min-h-9 items-center gap-2 text-small text-fg">
                              <Checkbox
                                name="required"
                                defaultChecked={question.required}
                              />
                              Required answer
                            </label>
                            <Field label="Answer visibility">
                              <Select
                                name="visibility"
                                defaultValue={question.visibility}
                              >
                                <option value="PUBLIC">Public</option>
                                <option value="ORGANIZER_ONLY">Organizers only</option>
                              </Select>
                            </Field>
                          </div>
                        </ActionForm>
                        <ActionForm
                          action={removeQuestionAction.bind(null, eventId, question.id)}
                          submitLabel="Remove"
                          pendingLabel="Removing…"
                          submitVariant="outline"
                          submitSize="sm"
                          className="shrink-0"
                        />
                        <div className="flex shrink-0 flex-col gap-2">
                          <ActionForm
                            action={moveQuestionAction.bind(null, eventId, question.id, "UP")}
                            submitLabel={`Move question ${index + 1} up`}
                            submitVariant="outline"
                            submitSize="sm"
                            submitDisabled={index === 0}
                          />
                          <ActionForm
                            action={moveQuestionAction.bind(null, eventId, question.id, "DOWN")}
                            submitLabel={`Move question ${index + 1} down`}
                            submitVariant="outline"
                            submitSize="sm"
                            submitDisabled={index === doc.event.customQuestions.length - 1}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mb-4 rounded-lg border border-dashed border-line-strong px-3.5 py-3 text-small text-fg-subtle">
                  No custom questions yet.
                </p>
              )}
              <AddPanel title="Add a project question">
                <ActionForm
                  action={addQuestionAction.bind(null, eventId)}
                  submitLabel="Add question"
                  pendingLabel="Adding…"
                >
                  <div className="space-y-3">
                    <Field label="Prompt" required>
                      <Textarea
                        name="prompt"
                        rows={2}
                        required
                        maxLength={300}
                        placeholder="What would you like participants to tell you?"
                      />
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex min-h-9 items-center gap-2 text-small text-fg">
                        <Checkbox name="required" />
                        Required answer
                      </label>
                      <Field label="Answer visibility">
                        <Select name="visibility" defaultValue="ORGANIZER_ONLY">
                          <option value="PUBLIC">Public</option>
                          <option value="ORGANIZER_ONLY">Organizers only</option>
                        </Select>
                      </Field>
                    </div>
                  </div>
                </ActionForm>
              </AddPanel>
            </section>
          </div>
        </Collapsible>

        <Collapsible
          title="Submissions"
          meta={
            <>
              <Badge tone="slate">{doc.projects.length} submitted</Badge>
              {lockedProjects > 0 ? (
                <Badge tone="emerald">{lockedProjects} locked</Badge>
              ) : null}
            </>
          }
          bodyClassName="!p-0"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-3.5">
            <p className="text-small text-fg-subtle">
              Locking a project freezes its latest revision.
            </p>
            <ActionForm
              action={lockAllProjectsAction.bind(null, eventId)}
              submitLabel="Lock all submissions"
              submitVariant="outline"
              submitSize="sm"
            />
          </div>
          {doc.projects.length === 0 ? (
            <EmptyStatePanel compact title="No projects yet." />
          ) : (
            <ul>
              {doc.projects.map((project) => (
                <li
                  key={project.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-3.5 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-small font-medium text-fg">
                      {project.title}
                    </p>
                    <p className="truncate text-caption text-fg-subtle">
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
                        submitVariant="secondary"
                        submitSize="sm"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>

        <Card>
          <CardHeader
            title="Members"
            description="Invite people by email, or let participants self-join while registration is open."
            action={<Badge tone="indigo">{doc.members.length} total</Badge>}
          />
          <CardBody className="border-b border-line-subtle bg-surface-sunken/40">
            <ActionForm
              action={addMemberAction.bind(null, eventId)}
              submitLabel="Add member"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Email">
                  <Input
                    type="email"
                    name="email"
                    required
                    placeholder="someone@example.com"
                  />
                </Field>
                <Field label="Role">
                  <Select name="role" aria-label="Role for new member" defaultValue="JUDGE">
                    <option value="JUDGE">Judge</option>
                    <option value="ORGANIZER">Organizer</option>
                  </Select>
                </Field>
              </div>
            </ActionForm>
          </CardBody>
          {doc.members.length === 0 ? (
            <CardBody>
              <EmptyStatePanel compact title="No members yet." />
            </CardBody>
          ) : (
            <ul>
              {doc.members.map((member) => (
                <li
                  key={member.userId}
                  data-testid="member-row"
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle px-5 py-3.5 last:border-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-caption font-semibold text-accent-soft-fg"
                    >
                      {initials(member.displayName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-small font-medium text-fg">
                        {member.displayName}
                      </p>
                      <p className="truncate text-caption text-fg-subtle">
                        {member.email}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
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
                      submitVariant="outline"
                      submitSize="sm"
                      layout="inline"
                      className="flex items-end gap-2"
                    >
                      <div className="w-36">
                        <Select
                          name="role"
                          defaultValue={member.role}
                          aria-label={`Role for ${member.displayName}`}
                        >
                          <option value="PARTICIPANT">Participant</option>
                          <option value="JUDGE">Judge</option>
                          <option value="ORGANIZER">Organizer</option>
                        </Select>
                      </div>
                    </ActionForm>
                    {actor.userId !== member.userId ? (
                      <ActionForm
                        action={removeMemberAction.bind(
                          null,
                          eventId,
                          member.userId,
                        )}
                        submitLabel="Remove"
                        submitVariant="outline"
                        submitSize="sm"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <JudgeInvitations eventId={eventId} />

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
          bodyClassName="!p-0"
        >
          {doc.applications.length === 0 ? (
            <EmptyStatePanel compact title="No judge applications yet." />
          ) : (
            <ul className="divide-y divide-line-subtle">
              {doc.applications.map((application) => (
                <li
                  key={application.id}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-small font-medium text-fg">
                      {application.displayName}
                      <span className="ml-2 text-caption text-fg-faint">
                        {application.email}
                      </span>
                    </p>
                    {application.rationale ? (
                      <p className="mt-1 line-clamp-2 text-caption text-fg-muted">
                        {application.rationale}
                      </p>
                    ) : null}
                    {application.attachmentName ? (
                      <p className="mt-1.5 text-caption">
                        <a
                          href={`/api/v1/events/${eventId}/judge-applications/${application.id}/attachment`}
                          data-testid="application-attachment"
                          className="font-medium text-accent hover:text-accent-hover hover:underline"
                        >
                          Download {application.attachmentName}
                        </a>
                        {application.attachmentSize
                          ? ` (${Math.max(1, Math.round(application.attachmentSize / 1024))}KB)`
                          : null}
                      </p>
                    ) : null}
                    <p className="mt-1 text-caption text-fg-faint">
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
                          submitSize="sm"
                        />
                        <ActionForm
                          action={decideJudgeApplicationAction.bind(
                            null,
                            eventId,
                            application.id,
                            "reject",
                          )}
                          submitLabel="Reject"
                          submitVariant="outline"
                          submitSize="sm"
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
                        submitVariant="outline"
                        submitSize="sm"
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>

        <Card>
          <CardHeader
            title="Rubrics"
            description="Criteria, weights and score ranges that judges use."
            action={
              doc.rubrics.length > 0 ? (
                <Badge tone="slate">
                  {doc.rubrics.length} rubric
                  {doc.rubrics.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          />
          <CardBody>
            <AddPanel
              title="Create a rubric"
              description="Start with a name, then add the criteria judges score against."
              className="mb-4"
            >
              <ActionForm
                action={createRubricAction.bind(null, eventId)}
                submitLabel="Create rubric"
              >
                <Field label="Rubric name">
                  <Input type="text" name="name" required />
                </Field>
              </ActionForm>
            </AddPanel>

            {doc.rubrics.length === 0 ? (
              <EmptyStatePanel
                compact
                icon="file"
                title="No rubrics yet."
                description="Judges cannot evaluate projects until a rubric is active."
              />
            ) : (
              <ul className="space-y-4">
                {doc.rubrics.map((rubric) => (
                  <li
                    key={rubric.id}
                    className="rounded-lg border border-line p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-fg">
                          {rubric.name}{" "}
                          <span className="text-caption text-fg-subtle">
                            v{rubric.version}
                          </span>
                        </p>
                        <p className="text-caption text-fg-subtle">
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
                          submitSize="sm"
                        />
                      ) : null}
                    </div>
                    {rubric.criteria.length ? (
                      <ul className="mt-3 space-y-1 text-small text-fg-muted">
                        {rubric.criteria.map((criterion) => (
                          <li key={criterion.id}>
                            {criterion.name}
                            {criterion.optional ? (
                              <span className="text-fg-faint"> (optional)</span>
                            ) : null}{" "}
                            — weight {criterion.weight}, range{" "}
                            {criterion.minScore}–{criterion.maxScore}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-small text-fg-subtle">
                        No criteria yet.
                      </p>
                    )}
                    <AddPanel
                      title={`Add criterion to “${rubric.name}”`}
                      className="mt-4"
                    >
                      <ActionForm
                        action={addCriterionAction.bind(
                          null,
                          eventId,
                          rubric.id,
                        )}
                        submitLabel="Add criterion"
                        submitSize="sm"
                      >
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Criterion name">
                            <Input type="text" name="name" required />
                          </Field>
                          <div className="grid grid-cols-3 gap-2">
                            <Field label="Weight">
                              <Input type="number" name="weight" required step="any" />
                            </Field>
                            <Field label="Min">
                              <Input
                                type="number"
                                name="minScore"
                                required
                                step="any"
                              />
                            </Field>
                            <Field label="Max">
                              <Input
                                type="number"
                                name="maxScore"
                                required
                                step="any"
                              />
                            </Field>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <Checkbox
                            id={`optional-${rubric.id}`}
                            name="optional"
                            value="on"
                          />
                          <label
                            htmlFor={`optional-${rubric.id}`}
                            className="text-small text-fg-muted"
                          >
                            Optional (judges may skip)
                          </label>
                        </div>
                      </ActionForm>
                    </AddPanel>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Judge assignments"
            description="Match judges to projects, then lock their evaluations."
            action={
              doc.assignments.length > 0 ? (
                <Badge tone="slate">{doc.assignments.length} assigned</Badge>
              ) : null
            }
          />
          <CardBody>
            <JudgeAssignmentPlanner
              eventId={eventId}
              judges={doc.judges}
              projects={doc.projects}
              tracks={doc.tracks}
            />
            {doc.judges.length === 0 ? (
              <Alert tone="warning">
                No judges in this event yet. Approve a judge application or add a
                judge under Members.
              </Alert>
            ) : doc.projects.length === 0 ? (
              <Alert tone="warning">
                No projects to assign yet. Assignments unlock once a participant
                submits a project.
              </Alert>
            ) : (
              <AddPanel
                title="Assign a judge"
                description="One judge per project, per rubric version."
                className="mb-4"
              >
                <ActionForm
                  action={assignJudgeAction.bind(null, eventId)}
                  submitLabel="Assign judge"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Judge">
                      <Select name="judgeId" required>
                        {doc.judges.map((judge) => (
                          <option key={judge.userId} value={judge.userId}>
                            {judge.displayName} ({judge.email})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Project">
                      <Select name="projectId" required>
                        {doc.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.title} ({project.teamName})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                </ActionForm>
              </AddPanel>
            )}

            {doc.assignments.length === 0 ? (
              <EmptyStatePanel
                compact
                icon="inbox"
                title="No assignments yet."
                description="Assign a judge above to start the queue."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-small">
                  <caption className="sr-only">Judge assignments</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-caption text-fg-subtle">
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Judge
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Project
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Status
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Submitted
                      </th>
                      <th scope="col" className="py-2 pr-4 font-medium">
                        Scores
                      </th>
                      <th scope="col" className="py-2 font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.assignments.map((item) => (
                      <tr key={item.id} className="border-b border-line-subtle">
                        <td className="py-2.5 pr-4 text-fg">{item.judgeName}</td>
                        <td className="py-2.5 pr-4 text-fg">{item.projectTitle}</td>
                        <td className="py-2.5 pr-4">
                          <Badge
                            tone={ASSIGNMENT_STATUS_TONE[item.status] ?? "slate"}
                          >
                            {STATUS_LABEL[item.status] ?? item.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 pr-4 text-fg-subtle">
                          {formatDate(item.submittedAt)}
                        </td>
                        <td
                          className="tabular py-2.5 pr-4 text-caption text-fg-muted"
                          data-testid="assignment-scores"
                        >
                          {item.scores.length > 0
                            ? item.scores
                                .map((s) => `${s.criterion} ${s.score}`)
                                .join(" · ")
                            : "—"}
                        </td>
                        <td className="py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.status === "ASSIGNED" ? (
                              <ActionForm
                                action={unassignJudgeAction.bind(
                                  null,
                                  eventId,
                                  item.id,
                                )}
                                submitLabel="Unassign"
                                submitVariant="outline"
                                submitSize="sm"
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
                                submitSize="sm"
                              />
                            ) : null}
                            {item.status === "LOCKED" ? (
                              <Badge
                                testId="assignment-locked-label"
                                tone="indigo"
                              >
                                Locked
                              </Badge>
                            ) : null}
                            {item.status === "IN_PROGRESS" ? (
                              <span className="text-caption text-fg-faint">
                                In progress
                              </span>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Rankings &amp; publication"
            description="Lock evaluations, build the final ranking, then publish it for participants."
            action={
              doc.snapshots.length > 0 ? (
                <Badge tone="slate">
                  {doc.snapshots.length} snapshot
                  {doc.snapshots.length === 1 ? "" : "s"}
                </Badge>
              ) : null
            }
          />
          <CardBody>
            <div className="flex flex-wrap items-center gap-3">
              {doc.event.state === "JUDGING" ? (
                <ActionForm
                  action={lockAllSubmissionsAction.bind(null, eventId)}
                  submitLabel="Lock submitted evaluations"
                  submitVariant="outline"
                />
              ) : null}
              {canRunRanking(doc.event.state) ? (
                <ActionForm
                  action={generateRankingAction.bind(null, eventId)}
                  submitLabel="Generate ranking snapshot"
                />
              ) : null}
            </div>

            {!doc.publishedRankingSnapshotId &&
            (doc.event.state === "RESULTS_READY" ||
              doc.event.state === "PUBLISHED") ? (
              <Alert
                tone="warning"
                testId="results-missing-warning"
                className="mt-4"
              >
                This event is{" "}
                {EVENT_STATE_LABEL[doc.event.state]?.toLowerCase()} but no
                results have been published. Publish a ranking so participants
                can see their scores.
              </Alert>
            ) : null}

            {doc.allEvaluationsLocked ? (
              <Alert
                tone="success"
                testId="all-locked-note"
                className="mt-4"
                title="All evaluations are locked."
              />
            ) : null}

            {doc.snapshots.length === 0 ? (
              <p className="mt-4 text-small text-fg-subtle">
                No ranking snapshots generated yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-2">
                {doc.snapshots.map((snapshot) => (
                  <li
                    key={snapshot.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-small font-medium text-fg">
                        Ranking snapshot{" "}
                        <span className="text-fg-subtle">
                          (v{snapshot.rankingVersion})
                        </span>
                      </p>
                      <p className="text-caption text-fg-subtle">
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
                        submitSize="sm"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}

            {results ? (
              <div className="mt-5 border-t border-line-subtle pt-4">
                <h3 className="text-subheading font-semibold text-fg">
                  Latest scores
                </h3>
                <ResultsMeta results={results} />
                <ResultsTable results={results} />
              </div>
            ) : null}
          </CardBody>
        </Card>

        <Collapsible
          title="Certificates"
          meta={
            <Badge tone={doc.certificatesCount > 0 ? "emerald" : "slate"}>
              {doc.certificatesCount} issued
            </Badge>
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-small text-fg-subtle">
              Issued certificates are public via shareable links.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <ActionForm
                action={issueCertificatesAction.bind(null, eventId)}
                submitLabel="Issue certificates"
                submitSize="sm"
              />
              {doc.certificatesCount > 0 ? (
                <>
                  <ActionForm
                    action={revokeCertificatesAction.bind(null, eventId)}
                    submitLabel="Revoke all"
                    submitVariant="destructive"
                    submitSize="sm"
                  />
                  <ButtonLink
                    href={`/events/${eventId}/certificates`}
                    variant="outline"
                    size="sm"
                  >
                    Open certificates
                  </ButtonLink>
                </>
              ) : null}
            </div>
          </div>
          {doc.certificatesCount === 0 ? (
            <p className="mt-4 text-small text-fg-subtle">
              No certificates yet. Issuing becomes available once results are
              ready.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-line-subtle">
              {doc.certificates.map((certificate) => (
                <li
                  key={certificate.id}
                  className="flex items-center justify-between gap-3 py-3 text-small"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-fg">
                      {certificate.displayName}
                    </p>
                    <p className="truncate text-caption text-fg-subtle">
                      {certificate.projectTitle}
                      {certificate.teamName ? ` · ${certificate.teamName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Badge testId="certificate-tier" tone="violet">
                      {CERTIFICATE_TIER_LABEL[
                        certificate.tier as keyof typeof CERTIFICATE_TIER_LABEL
                      ] ?? certificate.tier}
                      {certificate.rank ? ` · #${certificate.rank}` : ""}
                    </Badge>
                    <span className="text-caption text-fg-faint">
                      {formatDate(certificate.issuedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Collapsible>
      </div>
    </Page>
  );
}
