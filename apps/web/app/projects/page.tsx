import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { listPublicGallery } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

import { EmptyStatePanel } from "../../components/ui/empty-state";
import { Button } from "../../components/ui/button";
import { Input, Select } from "../../components/ui/input";
import { Page, PageHeader } from "../../components/ui/page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Project gallery" };

type Filters = { q?: string; event?: string; track?: string; tag?: string };

function idOrEmpty(value: unknown): string {
  return z.string().uuid().safeParse(value).success ? value as string : "";
}

/**
 * Cards without a submitted thumbnail still need to read as distinct entries
 * in a wall of forty — a single flat accent tile reads as one broken image
 * repeated, not a gallery. Pick a tone deterministically from the project id
 * so the same project always renders the same tile.
 */
const PLACEHOLDER_TONES = [
  "bg-accent-soft text-accent-soft-fg",
  "bg-accent2-soft text-accent2-soft-fg",
  "bg-warning-soft text-warning-fg",
  "bg-info-soft text-info-fg",
  "bg-success-soft text-success-fg",
] as const;

function placeholderTone(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_TONES[hash % PLACEHOLDER_TONES.length];
}

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const params = await searchParams;
  const filters = {
    q: typeof params.q === "string" ? params.q.trim().slice(0, 100) : "",
    event: idOrEmpty(params.event),
    track: idOrEmpty(params.track),
    tag: typeof params.tag === "string" ? params.tag.trim().slice(0, 40) : "",
  };
  const allProjects = await listPublicGallery();
  const projects = Object.values(filters).some(Boolean)
    ? await listPublicGallery(filters)
    : allProjects;
  const events = [...new Map(allProjects.map((project) => [project.eventId, project.eventName])).entries()];
  const tracks = [...new Map(allProjects.filter((project) => project.trackId).map((project) => [project.trackId!, project.trackName!])).entries()];
  const tags = [...new Set(allProjects.flatMap((project) => project.techTags))].sort();

  return (
    <Page width="wide">
      <PageHeader
        title="Project gallery"
        description="Explore the work teams have submitted across public events."
        className="mb-7"
      />

      <form method="get" action="/projects" role="search" className="mb-7 grid gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
        <label className="block text-small font-medium text-fg">
          Search projects
          <Input name="q" defaultValue={filters.q} maxLength={100} placeholder="Title, team, or description" className="mt-1.5" />
        </label>
        <label className="block text-small font-medium text-fg">
          Event
          <Select name="event" defaultValue={filters.event} className="mt-1.5">
            <option value="">All events</option>
            {events.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </label>
        <label className="block text-small font-medium text-fg">
          Track
          <Select name="track" defaultValue={filters.track} className="mt-1.5">
            <option value="">All tracks</option>
            {tracks.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        </label>
        <label className="block text-small font-medium text-fg">
          Technology
          <Select name="tag" defaultValue={filters.tag} className="mt-1.5">
            <option value="">All technologies</option>
            {tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </Select>
        </label>
        <Button type="submit" variant="secondary" className="w-full lg:w-auto">
          <Search aria-hidden="true" className="size-4" />
          Search
        </Button>
      </form>

      {projects.length === 0 ? (
        <EmptyStatePanel icon="search" title={allProjects.length ? "No projects match these filters" : "No submitted projects yet"} description={allProjects.length ? "Try a different search or clear a filter." : "Submitted work will appear here when teams share it."} action={allProjects.length ? <Link href="/projects" className="text-small font-medium text-accent hover:text-accent-hover">Clear filters</Link> : null} />
      ) : (
        <>
          <p className="mb-3 text-small text-fg-subtle">{projects.length} project{projects.length === 1 ? "" : "s"}</p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, index) => (
              <li key={project.id}>
                <Link href={`/projects/${project.id}`} className="group flex h-full flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-xs transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
                  <div
                    className={`relative flex aspect-[16/10] items-center justify-center overflow-hidden ${
                      project.thumbnailAssetId ? "bg-surface-sunken" : placeholderTone(project.id)
                    }`}
                  >
                    {project.thumbnailAssetId ? (
                      <img src={`/api/v1/assets/${project.thumbnailAssetId}`} alt="" loading="lazy" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
                    ) : (
                      <>
                        <span
                          aria-hidden="true"
                          className="tabular absolute top-3 left-3 text-caption opacity-70"
                        >
                          P-{String(index + 1).padStart(3, "0")}
                        </span>
                        <span aria-hidden="true" className="font-display px-6 text-center text-2xl font-semibold tracking-tight">
                          {project.title}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <p className="tabular text-caption text-fg-faint">[{project.eventName}{project.trackName ? ` / ${project.trackName}` : ""}]</p>
                    <h2 className="font-display mt-1.5 text-subheading font-semibold text-fg group-hover:text-accent-hover">{project.title}</h2>
                    <p className="mt-1 line-clamp-2 flex-1 text-small text-fg-muted">{project.tagline || project.description}</p>
                    <div className="mt-4 flex items-center justify-between gap-2 border-t border-line-subtle pt-3 text-caption text-fg-subtle">
                      <span>{project.teamName}</span>
                      <ArrowRight aria-hidden="true" className="size-4 shrink-0 text-accent" />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  );
}
