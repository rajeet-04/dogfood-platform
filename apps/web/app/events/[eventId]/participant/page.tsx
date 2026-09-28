import Link from "next/link";
import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { Badge, EmptyState, type BadgeTone } from "../../../../components/badge";
import { Collapsible } from "../../../../components/collapsible";
import { NotAllowed } from "../../../../components/not-allowed";
import {
  ResultsMeta,
  ResultsTable,
} from "../../../../components/results-table";
import { EVENT_STATE_LABEL, EVENT_STATE_TONE } from "../../../../lib/event-flow";
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

  const eventIdBinded = eventId;
  const submissionsOpen = home.event.state === "SUBMISSIONS_OPEN";
  const results = await getEventResults(eventId);
  const myRank = results?.entries.find(
    (entry) => entry.projectId === home.project?.id,
  );

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <div>
        <p className="text-sm text-slate-500">
          <Link href={`/events/${home.event.id}`} className="hover:underline">
            {home.event.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold tracking-tight">
          Participant dashboard
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Badge tone={EVENT_STATE_TONE[home.event.state] ?? "slate"}>
            {EVENT_STATE_LABEL[home.event.state] ?? home.event.state}
          </Badge>
          <span className="text-xs">
            Submission window: {formatDate(home.event.submissionOpensAt)} →{" "}
            {formatDate(home.event.submissionClosesAt)}
          </span>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Team</h2>
        {home.team ? (
          <div>
            <p className="text-slate-700">
              <span className="font-medium">Team name:</span> {home.team.name}
              {home.team.isOwner ? (
                <Badge tone="blue" className="ml-2">
                  Leader
                </Badge>
              ) : null}
            </p>
            <p
              data-testid="team-size"
              className="mt-1 text-sm text-slate-500"
            >
              {home.team.memberCount}
              {home.team.maxTeamSize
                ? ` of ${home.team.maxTeamSize}`
                : ""}{" "}
              {home.team.memberCount === 1 ? "member" : "members"}
            </p>
            <ul
              data-testid="team-members"
              className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200"
            >
              {home.team.members.map((member) => (
                <li
                  key={member.userId}
                  data-testid="team-member"
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">
                      {member.displayName}
                    </span>
                    {member.isOwner ? (
                      <Badge tone="blue" className="ml-2">
                        Leader
                      </Badge>
                    ) : null}
                    <span className="ml-2 text-xs text-slate-500">
                      {member.email}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {home.team.rosterLocked ? (
              <p
                data-testid="team-roster-locked"
                className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
              >
                Submissions are open, so team membership is locked. Teams can no
                longer be joined, left, or created.
              </p>
            ) : (
              <div className="mt-4 flex items-center gap-3">
                <ActionForm
                  action={createTeamInviteAction.bind(
                    null,
                    eventIdBinded,
                    home.team.id,
                  )}
                  submitLabel="Create invite"
                />
                <ActionForm
                  action={leaveTeamAction.bind(
                    null,
                    eventIdBinded,
                    home.team.id,
                  )}
                  submitLabel="Leave team"
                />
              </div>
            )}
          </div>
        ) : home.teamRosterLocked ? (
          <p
            data-testid="team-roster-locked"
            className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800"
          >
            Submissions are open, so team membership is locked. Teams can no
            longer be joined or created.
          </p>
        ) : (
          <div>
            <p className="mb-3 text-sm text-slate-500">
              You have not joined a team yet.
            </p>
            <ActionForm
              action={createTeamAction.bind(null, eventIdBinded)}
              submitLabel="Create team"
            >
              <label className="block text-sm font-medium">
                Team name
                <input
                  type="text"
                  name="name"
                  required
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            </ActionForm>
            <div className="mt-4 border-t pt-4">
              <p className="mb-3 text-sm text-slate-500">
                Have an invite code? Join an existing team.
              </p>
              <ActionForm
                action={joinTeamAction.bind(null, eventIdBinded)}
                submitLabel="Join team"
              >
                <label className="block text-sm font-medium">
                  Invite code
                  <input
                    type="text"
                    name="inviteCode"
                    required
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </label>
              </ActionForm>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Project</h2>
        {home.project ? (
          <div>
            <div className="rounded-xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {home.project.currentRevision.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
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
              <p className="mt-3 text-sm whitespace-pre-wrap">
                {home.project.currentRevision.description}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
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
                    className="self-center text-xs font-medium text-blue-600 hover:underline"
                  >
                    Repository
                  </a>
                ) : null}
              </div>
              {home.project.submittedAt ? (
                <p className="mt-3 text-sm text-slate-500">
                  Submitted {formatDate(home.project.submittedAt)}
                </p>
              ) : null}
            </div>

            {home.project.state === "DRAFT" ? (
              <div className="mt-5 border-t border-slate-100 pt-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">Revise project</h3>
                  <Badge tone={submissionsOpen ? "amber" : "slate"}>
                    {submissionsOpen ? "Editable" : "Submissions closed"}
                  </Badge>
                </div>
                <ReviseForm
                  eventId={eventIdBinded}
                  projectId={home.project.id}
                  initial={home.project.currentRevision}
                  submissionsOpen={submissionsOpen}
                />
                {submissionsOpen ? (
                  <div className="mt-4">
                    <ActionForm
                      action={submitProjectAction.bind(
                        null,
                        eventIdBinded,
                        home.project.id,
                      )}
                      submitLabel="Submit for judging"
                    />
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-amber-600">
                    Submissions are not currently open.
                  </p>
                )}
              </div>
            ) : home.project.state === "LOCKED" ? (
              <p
                data-testid="project-locked-note"
                className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700"
              >
                This submission is locked and can no longer be modified or
                withdrawn.
              </p>
            ) : (
              <div className="mt-4">
                <ActionForm
                  action={withdrawProjectAction.bind(
                    null,
                    eventIdBinded,
                    home.project.id,
                  )}
                  submitLabel="Withdraw submission"
                />
              </div>
            )}
          </div>
        ) : home.team ? (
          <div>
            <p className="mb-3 text-sm text-slate-500">
              No project yet. Create one to be eligible for judging.
            </p>
            <ActionForm
              action={createProjectAction.bind(null, eventIdBinded)}
              submitLabel="Create project"
            >
              <input type="hidden" name="teamId" value={home.team.id} />
              <ProjectFields />
            </ActionForm>
          </div>
        ) : (
          <p className="text-sm text-slate-500">
            Create a team first to make a project.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-lg font-semibold">Results</h2>
        {!results ? (
          <p className="text-sm text-slate-500" data-testid="results-pending">
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
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <div>
                  <p className="text-xs font-medium tracking-wide text-indigo-400 uppercase">
                    Your rank
                  </p>
                  <p className="text-indigo-900">
                    <span
                      className="text-2xl font-bold"
                      data-testid="my-rank"
                    >
                      #{myRank.rank}
                    </span>{" "}
                    <span className="text-sm">of {results.entries.length}</span>
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium tracking-wide text-indigo-400 uppercase">
                    Your score
                  </p>
                  <p
                    className="text-2xl font-bold text-indigo-900"
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
      </section>

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
          <EmptyState className="!px-0">No revisions yet.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-slate-500">
                <th className="py-2 pr-4 font-medium">Revision</th>
                <th className="py-2 pr-4 font-medium">Title</th>
                <th className="py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {home.revisions.map((revision) => (
                <tr key={revision.id} className="border-b last:border-0">
                  <td className="py-2 pr-4" data-testid="revision-row">
                    #{revision.revisionNumber}
                  </td>
                  <td className="py-2 pr-4">{revision.title}</td>
                  <td className="py-2">{formatDate(revision.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Collapsible>
    </main>
  );
}

function ProjectFields() {
  return (
    <>
      <label className="block text-sm font-medium">
        Title
        <input
          type="text"
          name="title"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Tagline
        <input
          type="text"
          name="tagline"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Description
        <textarea
          name="description"
          required
          rows={4}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Repository URL
        <input
          type="url"
          name="repositoryUrl"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Live URL
        <input
          type="url"
          name="liveUrl"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Demo video URL
        <input
          type="url"
          name="demoVideoUrl"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Tech tags (comma separated)
        <input
          type="text"
          name="techTags"
          placeholder="react, typescript"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </>
  );
}

function ReviseForm({
  eventId,
  projectId,
  initial,
  submissionsOpen,
}: {
  eventId: string;
  projectId: string;
  initial: {
    title: string;
    tagline: string | null;
    description: string;
    repositoryUrl: string | null;
    liveUrl: string | null;
    demoVideoUrl: string | null;
    techTags: string[];
  };
  submissionsOpen: boolean;
}) {
  if (!submissionsOpen) return null;
  return (
    <ActionForm
      action={reviseProjectAction.bind(null, eventId, projectId)}
      submitLabel="Save revision"
    >
      <ProjectFieldsPreset
        title={initial.title}
        tagline={initial.tagline ?? ""}
        description={initial.description}
        repositoryUrl={initial.repositoryUrl ?? ""}
        liveUrl={initial.liveUrl ?? ""}
        demoVideoUrl={initial.demoVideoUrl ?? ""}
        techTags={initial.techTags.join(", ")}
      />
    </ActionForm>
  );
}

function ProjectFieldsPreset(props: {
  title: string;
  tagline: string;
  description: string;
  repositoryUrl: string;
  liveUrl: string;
  demoVideoUrl: string;
  techTags: string;
}) {
  return (
    <>
      <label className="block text-sm font-medium">
        Title
        <input
          type="text"
          name="title"
          required
          defaultValue={props.title}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Tagline
        <input
          type="text"
          name="tagline"
          defaultValue={props.tagline}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Description
        <textarea
          name="description"
          required
          rows={4}
          defaultValue={props.description}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Repository URL
        <input
          type="url"
          name="repositoryUrl"
          defaultValue={props.repositoryUrl}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Live URL
        <input
          type="url"
          name="liveUrl"
          defaultValue={props.liveUrl}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Demo video URL
        <input
          type="url"
          name="demoVideoUrl"
          defaultValue={props.demoVideoUrl}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Tech tags (comma separated)
        <input
          type="text"
          name="techTags"
          defaultValue={props.techTags}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </label>
    </>
  );
}