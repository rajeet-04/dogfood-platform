import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { Badge, type BadgeTone } from "../../../../components/badge";
import { Collapsible } from "../../../../components/collapsible";
import { NotAllowed } from "../../../../components/not-allowed";
import { ProjectImagePicker } from "../../../../components/project-image-picker";
import {
  ResultsMeta,
  ResultsTable,
} from "../../../../components/results-table";
import { Alert } from "../../../../components/ui/alert";
import { Card, CardBody, CardFooter, CardHeader } from "../../../../components/ui/card";
import { EmptyStatePanel } from "../../../../components/ui/empty-state";
import { AddPanel, Field, Input, Select, Textarea } from "../../../../components/ui/input";
import { Page, PageHeader } from "../../../../components/ui/page-header";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../../../lib/event-flow";
import { isUuidId } from "../../../../lib/ids";
import { requireActor } from "../../../../server/session";
import { getParticipantHome } from "../../../../server/read-models/participant";
import {
  formatScore,
  getEventResults,
} from "../../../../server/read-models/results";
import {
  createTeamAction,
  createTeamInviteAction,
  joinTeamAction,
  leaveTeamAction,
} from "../../../../server/actions/team";
import {
  createProjectAction,
  reviseProjectAction,
  submitProjectAction,
  withdrawProjectAction,
} from "../../../../server/actions/project";

export const dynamic = "force-dynamic";

const PROJECT_STATE_TONE: Record<string, BadgeTone> = {
  DRAFT: "slate",
  SUBMITTED: "sky",
  LOCKED: "indigo",
};

const ROSTER_LOCKED_MESSAGE =
  "Submissions are open, so team membership is locked. Teams can no longer be joined, left, or created.";

function formatDate(value: Date | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  if (!isUuidId(eventId)) notFound();
  const actor = await requireActor();

  let home;
  try {
    home = await getParticipantHome(actor, eventId);
  } catch (err) {
    if (err instanceof DogfoodError) {
      if (err.code === "NOT_FOUND") notFound();
      if (err.code === "FORBIDDEN") {
        return (
          <NotAllowed
            message={err.message}
            backHref={`/events/${eventId}`}
          />
        );
      }
    }
    throw err;
  }

  const submissionsOpen = home.event.state === "SUBMISSIONS_OPEN";
  const results = await getEventResults(eventId);
  const myRank = results?.entries.find(
    (entry) => entry.projectId === home.project?.id,
  );

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Events", href: "/events" },
          { label: home.event.name, href: `/events/${home.event.id}` },
        ]}
        title="Participant dashboard"
        description="Manage your team, prepare the project submission and follow the results."
        meta={
          <>
            <Badge tone={EVENT_STATE_TONE[home.event.state] ?? "slate"}>
              {EVENT_STATE_LABEL[home.event.state] ?? home.event.state}
            </Badge>
            <span className="text-caption text-fg-subtle">
              Submission window: {formatDate(home.event.submissionOpensAt)} →{" "}
              {formatDate(home.event.submissionClosesAt)}
            </span>
          </>
        }
      />

      <div className="mt-6 space-y-5">
        <Card>
          <CardHeader title="Team" description="Who is building this submission." />
          <CardBody>
            {home.team ? (
              <div>
                <p className="text-body text-fg-muted">
                  <span className="font-medium text-fg">Team name:</span>{" "}
                  {home.team.name}
                  {home.team.isOwner ? (
                    <Badge tone="blue" className="ml-2">
                      Leader
                    </Badge>
                  ) : null}
                </p>
                <p
                  data-testid="team-size"
                  className="mt-1 text-small text-fg-subtle"
                >
                  {home.team.memberCount}
                  {home.team.maxTeamSize
                    ? ` of ${home.team.maxTeamSize}`
                    : ""}{" "}
                  {home.team.memberCount === 1 ? "member" : "members"}
                </p>
                <ul
                  data-testid="team-members"
                  className="mt-3 divide-y divide-line-subtle rounded-md border border-line"
                >
                  {home.team.members.map((member) => (
                    <li
                      key={member.userId}
                      data-testid="team-member"
                      className="flex items-center justify-between gap-3 px-3 py-2 text-small"
                    >
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-fg">
                          {member.displayName}
                        </span>
                        {member.isOwner ? (
                          <Badge tone="info">Leader</Badge>
                        ) : null}
                        <span className="min-w-0 truncate text-caption text-fg-subtle">
                          {member.email}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : home.teamRosterLocked ? (
              <Alert tone="warning" testId="team-roster-locked">
                {ROSTER_LOCKED_MESSAGE}
              </Alert>
            ) : (
              <div className="space-y-4">
                <p className="text-small text-fg-subtle">
                  You have not joined a team yet. Create one to submit a project.
                </p>
                <ActionForm
                  action={createTeamAction.bind(null, eventId)}
                  submitLabel="Create team"
                >
                  <Field label="Team name">
                    <Input type="text" name="name" required autoFocus />
                  </Field>
                </ActionForm>
                <AddPanel
                  title="Have an invite code?"
                  description="Join a team that already invited you."
                >
                  <ActionForm
                    action={joinTeamAction.bind(null, eventId)}
                    submitLabel="Join team"
                  >
                    <Field label="Invite code">
                      <Input
                        type="text"
                        name="inviteCode"
                        required
                        className="uppercase"
                      />
                    </Field>
                  </ActionForm>
                </AddPanel>
              </div>
            )}
          </CardBody>
          {home.team ? (
            home.team.rosterLocked ? (
              <CardFooter>
                <Alert
                  tone="warning"
                  testId="team-roster-locked"
                  className="w-full"
                >
                  {ROSTER_LOCKED_MESSAGE}
                </Alert>
              </CardFooter>
            ) : (
              <CardFooter>
                <ActionForm
                  action={createTeamInviteAction.bind(
                    null,
                    eventId,
                    home.team.id,
                  )}
                  submitLabel="Create invite"
                />
                <ActionForm
                  action={leaveTeamAction.bind(null, eventId, home.team.id)}
                  submitLabel="Leave team"
                  submitVariant="secondary"
                />
              </CardFooter>
            )
          ) : null}
        </Card>

        <Card>
          <CardHeader
            title="Project"
            description="The revision judges score, plus the current submission state."
          />
          <CardBody>
            {home.project ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-line bg-surface-sunken/50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-fg">
                        {home.project.currentRevision.title}
                      </h3>
                      <p className="mt-1 text-small text-fg-muted">
                        {home.project.currentRevision.tagline || "—"}
                      </p>
                    </div>
                    <Badge
                      testId="project-state"
                      tone={PROJECT_STATE_TONE[home.project.state] ?? "slate"}
                    >
                      {home.project.state}
                    </Badge>
                  </div>
                  <p className="mt-3 text-small whitespace-pre-wrap text-fg-muted">
                    {home.project.currentRevision.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {home.project.currentRevision.techTags.map((tag) => (
                      <Badge key={tag} tone="slate">
                        {tag}
                      </Badge>
                    ))}
                    {home.project.currentRevision.repositoryUrl ? (
                      <a
                        href={home.project.currentRevision.repositoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-caption font-medium text-accent hover:text-accent-hover hover:underline"
                      >
                        Repository
                      </a>
                    ) : null}
                  </div>
                  {home.project.submittedAt ? (
                    <p className="mt-3 text-caption text-fg-subtle">
                      Submitted {formatDate(home.project.submittedAt)}
                    </p>
                  ) : null}
                </div>

                {home.project.state === "DRAFT" ? (
                  <div className="space-y-4 border-t border-line-subtle pt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-small font-medium text-fg">
                        Revise project
                      </h3>
                      <Badge tone={submissionsOpen ? "amber" : "slate"}>
                        {submissionsOpen ? "Editable" : "Submissions closed"}
                      </Badge>
                    </div>
                    {submissionsOpen ? (
                      <>
                        <ActionForm
                          action={reviseProjectAction.bind(
                            null,
                            eventId,
                            home.project.id,
                          )}
                          submitLabel="Save revision"
                        >
                          <ProjectFields
                            eventId={eventId}
                            tracks={home.tracks}
                            questions={home.event.customQuestions}
                            defaults={{
                              currentRevisionId:
                                home.project.currentRevision.id,
                              title: home.project.currentRevision.title,
                              tagline: home.project.currentRevision.tagline ?? "",
                              description:
                                home.project.currentRevision.description,
                              repositoryUrl:
                                home.project.currentRevision.repositoryUrl ?? "",
                              liveUrl:
                                home.project.currentRevision.liveUrl ?? "",
                              demoVideoUrl:
                                home.project.currentRevision.demoVideoUrl ?? "",
                              techTags:
                                home.project.currentRevision.techTags.join(", "),
                              trackId: home.project.currentRevision.trackId,
                              thumbnailAssetId:
                                home.project.currentRevision.thumbnailAssetId,
                              imageAssetIds:
                                home.project.currentRevision.imageAssetIds,
                              customAnswers:
                                home.project.currentRevision.customAnswers,
                            }}
                          />
                        </ActionForm>
                        <div className="border-t border-line-subtle pt-4">
                          <Alert tone="warning" className="mb-3">
                            Save the revision first. Submission uses the last saved revision and locks it for judging.
                          </Alert>
                          <ActionForm
                            action={submitProjectAction.bind(
                              null,
                              eventId,
                              home.project.id,
                            )}
                            submitLabel="Submit saved revision"
                          />
                        </div>
                      </>
                    ) : (
                      <Alert tone="warning">
                        Submissions are not currently open.
                      </Alert>
                    )}
                  </div>
                ) : home.project.state === "LOCKED" ? (
                  <Alert tone="neutral" testId="project-locked-note">
                    This submission is locked and can no longer be modified or
                    withdrawn.
                  </Alert>
                ) : (
                  <div>
                    <ActionForm
                      action={withdrawProjectAction.bind(
                        null,
                        eventId,
                        home.project.id,
                      )}
                      submitLabel="Withdraw submission"
                      submitVariant="outline"
                    />
                  </div>
                )}
              </div>
            ) : home.team ? (
              <div>
                <p className="mb-3 text-small text-fg-subtle">
                  No project yet. Create one to be eligible for judging.
                </p>
                <ActionForm
                  action={createProjectAction.bind(null, eventId)}
                  submitLabel="Create project"
                >
                  <input type="hidden" name="teamId" value={home.team.id} />
                  <ProjectFields
                    eventId={eventId}
                    tracks={home.tracks}
                    questions={home.event.customQuestions}
                  />
                </ActionForm>
              </div>
            ) : (
              <p className="text-small text-fg-subtle">
                Create a team first to make a project.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Results"
            description="Rankings appear once organizers publish the snapshot."
          />
          <CardBody>
            {!results ? (
              <p
                className="text-small text-fg-subtle"
                data-testid="results-pending"
              >
                {home.event.state === "RESULTS_READY" ||
                home.event.state === "PUBLISHED" ||
                home.event.state === "ARCHIVED"
                  ? "Results have not been published for this event yet. Check back once the organizers release the rankings."
                  : "Scores are not available yet. They appear here once the organizers publish the results."}
              </p>
            ) : (
              <div data-testid="results-section">
                <ResultsMeta results={results} />
                {myRank ? (
                  <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-accent-border bg-accent-soft/60 p-4">
                    <div>
                      <p className="text-micro font-semibold tracking-[0.06em] text-accent-soft-fg uppercase">
                        Your rank
                      </p>
                      <p className="text-fg">
                        <span
                          className="text-title font-semibold"
                          data-testid="my-rank"
                        >
                          #{myRank.rank}
                        </span>{" "}
                        <span className="text-small">
                          of {results.entries.length}
                        </span>
                      </p>
                    </div>
                    <div>
                      <p className="text-micro font-semibold tracking-[0.06em] text-accent-soft-fg uppercase">
                        Your score
                      </p>
                      <p
                        className="text-title font-semibold text-fg"
                        data-testid="my-score"
                      >
                        {formatScore(myRank.weightedTotal ?? myRank.score)}
                      </p>
                    </div>
                  </div>
                ) : null}
                <ResultsTable
                  results={results}
                  highlightProjectId={home.project?.id ?? null}
                />
              </div>
            )}
          </CardBody>
        </Card>

        <Collapsible
          title="Revision history"
          meta={
            <Badge tone="slate">
              {home.revisions.length} revision
              {home.revisions.length === 1 ? "" : "s"}
            </Badge>
          }
        >
          {home.revisions.length === 0 ? (
            <EmptyStatePanel compact title="No revisions yet." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-line text-left text-caption text-fg-subtle">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Revision
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Title
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {home.revisions.map((revision) => (
                    <tr
                      key={revision.id}
                      className="border-b border-line-subtle last:border-0"
                    >
                      <td className="py-2 pr-4" data-testid="revision-row">
                        #{revision.revisionNumber}
                      </td>
                      <td className="py-2 pr-4 text-fg">{revision.title}</td>
                      <td className="py-2 text-fg-subtle">
                        {formatDate(revision.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Collapsible>
      </div>
    </Page>
  );
}

function ProjectFields({
  eventId,
  tracks,
  questions,
  defaults,
}: {
  eventId: string;
  tracks: Array<{ id: string; name: string }>;
  questions: Array<{
    id: string;
    prompt: string;
    required: boolean;
    visibility: "PUBLIC" | "ORGANIZER_ONLY";
    order: number;
  }>;
  defaults?: {
    currentRevisionId: string;
    title: string;
    tagline: string;
    description: string;
    repositoryUrl: string;
    liveUrl: string;
    demoVideoUrl: string;
    techTags: string;
    trackId: string | null;
    thumbnailAssetId: string | null;
    imageAssetIds: string[];
    customAnswers: Record<string, string>;
  };
}) {
  return (
    <div className="space-y-4">
      {defaults ? (
        <input
          type="hidden"
          name="expectedCurrentRevisionId"
          value={defaults.currentRevisionId}
        />
      ) : null}
      <p className="text-caption text-fg-subtle">
        Save a draft at any stage. Fields marked required must be complete before you submit for judging.
      </p>
      <Field label="Title">
        <Input type="text" name="title" maxLength={120} defaultValue={defaults?.title} />
      </Field>
      <Field label="Tagline" description="One line that sells the project.">
        <Input type="text" name="tagline" defaultValue={defaults?.tagline} />
      </Field>
      <Field label="Description">
        <Textarea
          name="description"
          rows={4}
          maxLength={4_000}
          defaultValue={defaults?.description}
        />
      </Field>
      <Field label="Repository URL">
        <Input
          type="url"
          name="repositoryUrl"
          defaultValue={defaults?.repositoryUrl}
        />
      </Field>
      <Field label="Live URL">
        <Input type="url" name="liveUrl" defaultValue={defaults?.liveUrl} />
      </Field>
      <Field label="Demo video URL">
        <Input
          type="url"
          name="demoVideoUrl"
          defaultValue={defaults?.demoVideoUrl}
        />
      </Field>
      <Field label="Tech tags (comma separated)">
        <Input
          type="text"
          name="techTags"
          placeholder="react, typescript"
          defaultValue={defaults?.techTags}
        />
      </Field>
      {tracks.length > 0 ? (
        <Field label="Track" description="Optional.">
          <Select name="trackId" defaultValue={defaults?.trackId ?? ""}>
            <option value="">Choose a track</option>
            {tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <ProjectImagePicker
        eventId={eventId}
        initialAssetIds={defaults?.imageAssetIds}
        initialThumbnailAssetId={defaults?.thumbnailAssetId}
      />
      {questions.map((question) => (
        <Field
          key={question.id}
          label={question.prompt}
          required={question.required}
          description={question.required ? "Answer this before submitting." : undefined}
        >
          <Textarea
            name={`customAnswer:${question.id}`}
            rows={3}
            maxLength={4_000}
            defaultValue={defaults?.customAnswers[question.id] ?? ""}
          />
        </Field>
      ))}
    </div>
  );
}
