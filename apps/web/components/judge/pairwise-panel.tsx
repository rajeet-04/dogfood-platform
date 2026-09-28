"use client";

import { useEffect, useState } from "react";

type Project = { id: string; title: string };
type Comparison = { winnerProjectId: string; loserProjectId: string };

export function PairwisePanel({ eventId }: { eventId: string }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [comparisons, setComparisons] = useState<Comparison[]>([]);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const apiUrl = `/api/v1/events/${eventId}/pairwise-comparisons`;

  async function refresh() {
    const response = await fetch(apiUrl, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Could not load assigned projects.");
    setProjects(payload.projects);
    setComparisons(payload.comparisons);
    setFirstId((current) => current || payload.projects[0]?.id || "");
    setSecondId((current) => current || payload.projects[1]?.id || "");
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load comparisons."))
      .finally(() => setLoading(false));
  }, [apiUrl]);

  async function choose(winnerProjectId: string) {
    setSaving(true);
    setMessage("");
    try {
      const loserProjectId = winnerProjectId === firstId ? secondId : firstId;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winnerProjectId, loserProjectId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not save this comparison.");
      setMessage("Preference saved.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save this comparison.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-small text-fg-subtle" role="status">Loading your assigned projects…</p>;
  if (projects.length < 2) return <p className="text-small text-fg-subtle">You need at least two assigned projects to compare.</p>;

  const first = projects.find((project) => project.id === firstId);
  const second = projects.find((project) => project.id === secondId);
  const firstWins = comparisons.filter((comparison) => comparison.winnerProjectId === firstId && comparison.loserProjectId === secondId).length;
  const secondWins = comparisons.filter((comparison) => comparison.winnerProjectId === secondId && comparison.loserProjectId === firstId).length;

  return (
    <div className="space-y-5">
      <p className="text-small text-fg-muted">Compare projects assigned to you. Your latest choice for each pair is saved and used in the organizer’s Bradley–Terry ranking.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-small font-medium text-fg">
          First project
          <select className="mt-1 block min-h-10 w-full rounded-md border border-line bg-surface px-3 text-small" value={firstId} onChange={(event) => setFirstId(event.target.value)}>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
        <label className="block text-small font-medium text-fg">
          Second project
          <select className="mt-1 block min-h-10 w-full rounded-md border border-line bg-surface px-3 text-small" value={secondId} onChange={(event) => setSecondId(event.target.value)}>
            {projects.filter((project) => project.id !== firstId).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" disabled={saving || !first || !second || firstId === secondId} onClick={() => void choose(firstId)} className="min-h-11 rounded-md border border-line bg-surface px-4 py-3 text-left text-small font-medium text-fg transition-colors hover:border-accent hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-50">
          Prefer <span className="block">{first?.title}</span>
        </button>
        <button type="button" disabled={saving || !first || !second || firstId === secondId} onClick={() => void choose(secondId)} className="min-h-11 rounded-md border border-line bg-surface px-4 py-3 text-left text-small font-medium text-fg transition-colors hover:border-accent hover:bg-accent-subtle disabled:cursor-not-allowed disabled:opacity-50">
          Prefer <span className="block">{second?.title}</span>
        </button>
      </div>
      {message ? <p className="text-small text-fg-subtle" role="status">{message}</p> : null}
      <p className="text-caption text-fg-subtle">{comparisons.length} pairwise choice{comparisons.length === 1 ? "" : "s"} saved{firstId !== secondId ? ` · this pair: ${firstWins + secondWins ? `${firstWins ? first?.title : second?.title} preferred` : "not compared yet"}` : ""}</p>
    </div>
  );
}
