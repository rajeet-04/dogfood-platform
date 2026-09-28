import Link from "next/link";
import { notFound } from "next/navigation";
import { DogfoodError } from "@dogfood/validation";

import { ActionForm } from "../../../../components/action-form";
import { NotAllowed } from "../../../../components/not-allowed";
import { EVENT_STATE_LABEL } from "../../../../lib/event-flow";
import { requireActor } from "../../../../server/session";
import { getParticipantHome } from "../../../../server/read-models/participant";
import {
  createTeamAction,
  createTeamInviteAction,
  leaveTeamAction,
} from "../../../../server/actions/team";
import {
  createProjectAction,
  reviseProjectAction,
  submitProjectAction,
  withdrawProjectAction,
} from "../../../../server/actions/project";

export const dynamic = "force-dynamic";

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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8">
        <p className="text-sm text-slate-500">
          <Link href={`/events/${home.event.id}`} className="hover:underline">
            {home.event.name}
          </Link>
        </p>
        <h1 className="text-2xl font-bold">Participant dashboard</h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">
            {EVENT_STATE_LABEL[home.event.state] ?? home.event.state}
          </span>
          <span>
            Submission window: {formatDate(home.event.submissionOpensAt)} →
            {formatDate(home.event.submissionClosesAt)}
          </span>
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Team</h2>
        {home.team ? (
          <div>
            <p className="text-slate-700">
              <span className="font-medium">Team name:</span> {home.team.name}
            </p>
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
                action={leaveTeamAction.bind(null, eventIdBinded, home.team.id)}
                submitLabel="Leave team"
              />
            </div>
          </div>
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
          </div>
        )}
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Project</h2>
        {home.project ? (
          <div>
            <div className="rounded-md bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">
                    {home.project.currentRevision.title}
                  </h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {home.project.currentRevision.tagline || "—"}
                  </p>
                </div>
                <span
                  data-testid="project-state"
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium"
                >
                  {home.project.state}
                </span>
              </div>
              <p className="mt-3 text-sm">{home.project.currentRevision.description}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {home.project.currentRevision.techTags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-slate-200 px-2 py-0.5 text-xs"
                  >
                    {tag}
                  </span>
                ))}
                {home.project.currentRevision.repositoryUrl ? (
                  <a
                    href={home.project.currentRevision.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 hover:underline"
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
              <div className="mt-5">
                <h3 className="mb-3 font-medium">Revise project</h3>
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

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Revision history</h2>
        {home.revisions.length === 0 ? (
          <p className="text-sm text-slate-500">No revisions yet.</p>
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
                <tr key={revision.id} className="border-b">
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
      </section>
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