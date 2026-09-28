"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "../badge";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { AddPanel } from "../ui/input";
import { Checkbox, Field, Input, Select } from "../ui/input";

type JudgeOption = { userId: string; displayName: string; email: string };
type ProjectOption = {
  id: string;
  title: string;
  teamName: string;
  trackId: string | null;
};
type TrackOption = { id: string; name: string };
type Preview = {
  proposal: Array<{ judgeId: string; projectId: string }>;
  coverage: {
    projectCount: number;
    requiredReviews: number;
    coveredReviews: number;
    completeProjects: number;
    underCovered: Array<{
      projectId: string;
      title: string;
      assignedReviews: number;
      requiredReviews: number;
    }>;
    judgeLoads: Array<{ judgeId: string; assignments: number }>;
  };
  warnings: string[];
};
type Recusal = {
  id: string;
  eventId: string;
  judgeId: string;
  projectId: string;
  reason: string;
  createdBy: string;
  createdAt: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const responseText = await response.text();
  const body: unknown = responseText ? JSON.parse(responseText) : undefined;
  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } } | undefined;
    const message =
      errorBody?.error?.message
        ? errorBody.error.message
        : "The request could not be completed.";
    throw new Error(message);
  }
  return body as T;
}

export function JudgeAssignmentPlanner({
  eventId,
  judges,
  projects,
  tracks,
}: {
  eventId: string;
  judges: JudgeOption[];
  projects: ProjectOption[];
  tracks: TrackOption[];
}) {
  const router = useRouter();
  const basePath = `/api/v1/events/${encodeURIComponent(eventId)}`;
  const judgeName = useMemo(
    () => new Map(judges.map((judge) => [judge.userId, judge.displayName])),
    [judges],
  );
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects],
  );
  const trackName = useMemo(
    () => new Map(tracks.map((track) => [track.id, track.name])),
    [tracks],
  );

  const [strategy, setStrategy] = useState("round_robin");
  const [reviewsPerProject, setReviewsPerProject] = useState(2);
  const [judgeIds, setJudgeIds] = useState(() => judges.map((judge) => judge.userId));
  const [trackId, setTrackId] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [recusals, setRecusals] = useState<Recusal[]>([]);
  const [recusalJudgeId, setRecusalJudgeId] = useState(judges[0]?.userId ?? "");
  const [recusalProjectId, setRecusalProjectId] = useState(projects[0]?.id ?? "");
  const [recusalReason, setRecusalReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filteredProjects = useMemo(
    () => projects.filter((project) => !trackId || project.trackId === trackId),
    [projects, trackId],
  );

  async function loadRecusals() {
    try {
      const result = await requestJson<{ recusals: Recusal[] }>(
        `${basePath}/judge-recusals`,
      );
      setRecusals(result.recusals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load recusals.");
    }
  }

  useEffect(() => {
    void loadRecusals();
    // The event-scoped route stays fixed for this mounted organizer page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePath]);

  function invalidatePreview() {
    setPreview(null);
    setNotice(null);
  }

  function payload(commit: boolean, expectedProposal?: Preview["proposal"]) {
    return {
      strategy,
      reviewsPerProject,
      judgeIds,
      ...(trackId ? { trackIds: [trackId] } : {}),
      ...(commit && expectedProposal ? { expectedProposal } : {}),
      commit,
    };
  }

  async function generate(
    commit: boolean,
    expectedProposal?: Preview["proposal"],
  ) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await requestJson<Preview>(
        `${basePath}/judge-assignments/generate`,
        {
          method: "POST",
          body: JSON.stringify(payload(commit, expectedProposal)),
        },
      );
      if (commit) {
        setPreview(null);
        setNotice(
          `Applied ${result.proposal.length} judge assignment${result.proposal.length === 1 ? "" : "s"}.`,
        );
        router.refresh();
      } else {
        setPreview(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate assignments.");
    } finally {
      setBusy(false);
    }
  }

  async function addRecusal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestJson<{ recusal: Recusal }>(`${basePath}/judge-recusals`, {
        method: "POST",
        body: JSON.stringify({
          judgeId: recusalJudgeId,
          projectId: recusalProjectId,
          reason: recusalReason.trim(),
        }),
      });
      setRecusalReason("");
      invalidatePreview();
      await loadRecusals();
      setNotice("Recusal added. Generate a fresh preview before applying assignments.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the recusal.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRecusal(recusalId: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await requestJson<{ recusal: Recusal }>(
        `${basePath}/judge-recusals/${encodeURIComponent(recusalId)}`,
        { method: "DELETE" },
      );
      invalidatePreview();
      await loadRecusals();
      setNotice("Recusal removed. Generate a fresh preview before applying assignments.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the recusal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5 space-y-5 border-b border-line-subtle pb-5">
      <section aria-labelledby="batch-assignment-title" className="space-y-3">
        <div>
          <h3 id="batch-assignment-title" className="text-subheading font-semibold text-fg">
            Batch assignment preview
          </h3>
          <p className="mt-0.5 text-caption text-fg-subtle">
            Review proposed judge coverage before adding assignments to the queue.
          </p>
        </div>

        {judges.length === 0 || filteredProjects.length === 0 ? (
          <Alert tone="warning">
            {judges.length === 0
              ? "Add at least one judge before generating assignments."
              : "No projects match this track. Choose another track or submit projects first."}
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Strategy">
            <Select
              value={strategy}
              onChange={(event) => {
                setStrategy(event.target.value);
                invalidatePreview();
              }}
            >
              <option value="round_robin">Round robin</option>
              <option value="balanced_by_track">Balance by track</option>
            </Select>
          </Field>
          <Field label="Reviews per project" description="Target reviews for each included project.">
            <Input
              type="number"
              min={1}
              step={1}
              value={reviewsPerProject}
              onChange={(event) => {
                setReviewsPerProject(Number(event.target.value));
                invalidatePreview();
              }}
            />
          </Field>
          <Field label="Track filter" description="Projects without a track remain included under All tracks.">
            <Select
              value={trackId}
              onChange={(event) => {
                setTrackId(event.target.value);
                invalidatePreview();
              }}
            >
              <option value="">All tracks</option>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>{track.name}</option>
              ))}
            </Select>
          </Field>
          <div className="self-end">
            <Button
              type="button"
              disabled={busy || judges.length === 0 || filteredProjects.length === 0 || judgeIds.length === 0}
              onClick={() => void generate(false)}
              className="w-full"
            >
              {busy ? "Working…" : "Preview assignments"}
            </Button>
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-small font-medium text-fg">Judges included</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {judges.map((judge) => (
              <label key={judge.userId} className="inline-flex items-center gap-2 text-small text-fg-muted">
                <Checkbox
                  checked={judgeIds.includes(judge.userId)}
                  onChange={(event) => {
                    setJudgeIds((current) => event.target.checked
                      ? [...current, judge.userId]
                      : current.filter((id) => id !== judge.userId));
                    invalidatePreview();
                  }}
                />
                <span>{judge.displayName}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {notice ? <p role="status" className="text-small text-success-fg">{notice}</p> : null}

        {preview ? (
          <div className="space-y-4 rounded-lg border border-line bg-surface-sunken/50 p-4" aria-live="polite">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-small font-semibold text-fg">Coverage preview</h4>
                <p className="mt-0.5 text-caption text-fg-subtle">
                  {preview.coverage.coveredReviews} of {preview.coverage.requiredReviews} review slots covered · {preview.coverage.completeProjects} of {preview.coverage.projectCount} projects fully covered
                </p>
              </div>
              <Badge tone={preview.coverage.underCovered.length === 0 ? "emerald" : "amber"}>
                {preview.coverage.underCovered.length === 0
                  ? "Coverage complete"
                  : `${preview.coverage.underCovered.length} project${preview.coverage.underCovered.length === 1 ? "" : "s"} need more reviews`}
              </Badge>
            </div>

            {preview.coverage.underCovered.length > 0 ? (
              <div className="space-y-2" role="status">
                <p className="text-small font-medium text-warning-fg">Projects below target</p>
                <ul className="space-y-1 text-small text-fg-muted">
                  {preview.coverage.underCovered.map((item) => (
                    <li key={item.projectId} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
                      <span>{item.title || projectById.get(item.projectId)?.title || "Project"}</span>
                      <span className="text-fg-subtle">{item.assignedReviews} / {item.requiredReviews} reviews</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.warnings.length > 0 ? (
              <ul className="space-y-1 text-small text-warning-fg" aria-label="Assignment warnings">
                {preview.warnings.map((warning, index) => <li key={`${index}-${warning}`}>{warning}</li>)}
              </ul>
            ) : null}

            <div className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h5 className="text-small font-semibold text-fg">Proposed assignments</h5>
                <span className="text-caption text-fg-subtle">{preview.proposal.length} new assignment{preview.proposal.length === 1 ? "" : "s"}</span>
              </div>
              {preview.proposal.length === 0 ? (
                <p className="text-small text-fg-subtle">No new assignments are needed for the selected projects and judges.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-small">
                    <caption className="sr-only">Proposed judge assignments</caption>
                    <thead>
                      <tr className="border-b border-line text-left text-caption text-fg-subtle">
                        <th scope="col" className="py-2 pr-4 font-medium">Judge</th>
                        <th scope="col" className="py-2 pr-4 font-medium">Project</th>
                        <th scope="col" className="py-2 font-medium">Track</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.proposal.map((item, index) => {
                        const project = projectById.get(item.projectId);
                        return (
                          <tr key={`${item.judgeId}-${item.projectId}-${index}`} className="border-b border-line-subtle">
                            <td className="py-2 pr-4 text-fg">{judgeName.get(item.judgeId) ?? "Unknown judge"}</td>
                            <td className="py-2 pr-4 text-fg">{project?.title ?? "Unknown project"}<span className="ml-1 text-caption text-fg-subtle">({project?.teamName ?? "Team"})</span></td>
                            <td className="py-2 text-fg-subtle">{project?.trackId ? trackName.get(project.trackId) ?? "Track" : "Unassigned"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-caption font-medium text-fg-subtle">Current load after this proposal</p>
              <div className="flex flex-wrap gap-2">
                {preview.coverage.judgeLoads.map((load) => (
                  <Badge key={load.judgeId} tone="slate">
                    {judgeName.get(load.judgeId) ?? "Unknown judge"}: {load.assignments}
                  </Badge>
                ))}
              </div>
            </div>

            {preview.proposal.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3 border-t border-line-subtle pt-3">
                <Button type="button" disabled={busy} onClick={() => void generate(true, preview.proposal)}>
                  {busy ? "Applying…" : `Apply ${preview.proposal.length} assignment${preview.proposal.length === 1 ? "" : "s"}`}
                </Button>
                <span className="text-caption text-fg-subtle">Adds these assignments to the judge queue.</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="judge-recusals-title" className="space-y-3">
        <div>
          <h3 id="judge-recusals-title" className="text-subheading font-semibold text-fg">Judge recusals</h3>
          <p className="mt-0.5 text-caption text-fg-subtle">
            Exclude a judge from a project when there is a conflict of interest.
          </p>
        </div>
        {judges.length === 0 || projects.length === 0 ? (
          <p className="text-small text-fg-subtle">Add a judge and submit a project to manage recusals.</p>
        ) : (
          <AddPanel title="Add a recusal" className="mb-0">
            <form onSubmit={(event) => void addRecusal(event)}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Judge">
                  <Select value={recusalJudgeId} onChange={(event) => setRecusalJudgeId(event.target.value)}>
                    {judges.map((judge) => <option key={judge.userId} value={judge.userId}>{judge.displayName}</option>)}
                  </Select>
                </Field>
                <Field label="Project">
                  <Select value={recusalProjectId} onChange={(event) => setRecusalProjectId(event.target.value)}>
                    {projects.map((project) => <option key={project.id} value={project.id}>{project.title} ({project.teamName})</option>)}
                  </Select>
                </Field>
                <Field label="Reason" className="sm:col-span-2" description="This note is visible to event organizers.">
                  <Input value={recusalReason} onChange={(event) => setRecusalReason(event.target.value)} maxLength={500} required />
                </Field>
              </div>
              <div className="mt-3">
                <Button type="submit" variant="secondary" disabled={busy || !recusalReason.trim()}>
                  Add recusal
                </Button>
              </div>
            </form>
          </AddPanel>
        )}

        {recusals.length > 0 ? (
          <ul className="divide-y divide-line-subtle" aria-label="Current judge recusals">
            {recusals.map((recusal) => {
              const project = projectById.get(recusal.projectId);
              return (
                <li key={recusal.id} className="flex flex-wrap items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0 text-small">
                    <p className="font-medium text-fg">
                      {judgeName.get(recusal.judgeId) ?? "Unknown judge"} · {project?.title ?? "Unknown project"}
                    </p>
                    <p className="mt-0.5 text-caption text-fg-subtle">{recusal.reason}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void removeRecusal(recusal.id)}>
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-small text-fg-subtle">No judge recusals recorded.</p>
        )}
      </section>
    </div>
  );
}
