import { ArrowUpRight, Code2 } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPublicGalleryProject } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

import { Page, PageHeader } from "../../../components/ui/page-header";

export const dynamic = "force-dynamic";

function safeUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) return { title: "Project" };
  const project = await getPublicGalleryProject(projectId);
  return { title: project?.title ?? "Project", description: project?.tagline ?? undefined };
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) notFound();
  const project = await getPublicGalleryProject(projectId);
  if (!project) notFound();

  const links = [
    { label: "Live project", url: safeUrl(project.liveUrl), icon: ArrowUpRight },
    { label: "Repository", url: safeUrl(project.repositoryUrl), icon: Code2 },
    { label: "Demo video", url: safeUrl(project.demoVideoUrl), icon: ArrowUpRight },
  ].filter((link) => link.url);

  return (
    <Page width="wide">
      <PageHeader
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.title }]}
        title={project.title}
        description={project.tagline || undefined}
        meta={<p className="text-small text-fg-subtle">By {project.teamName} · <Link href={`/projects?event=${project.eventId}`} className="font-medium text-accent hover:text-accent-hover">{project.eventName}</Link>{project.trackName ? ` · ${project.trackName}` : ""}</p>}
        className="mb-8"
      />

      {project.thumbnailAssetId ? (
        <div className="mb-8 overflow-hidden rounded-xl border border-line bg-surface-sunken">
          <img src={`/api/v1/assets/${project.thumbnailAssetId}`} alt={`${project.title} thumbnail`} className="aspect-[16/7] w-full object-cover" />
        </div>
      ) : null}

      <div className="grid gap-9 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-9">
          <section>
            <h2 className="text-subheading font-semibold text-fg">About this project</h2>
            <p className="mt-3 max-w-prose whitespace-pre-wrap text-body leading-7 text-fg-muted">{project.description}</p>
          </section>

          {project.images.length > 0 ? (
            <section>
              <h2 className="text-subheading font-semibold text-fg">Project images</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {project.images.map((image, index) => (
                  <li key={image.assetId} className="overflow-hidden rounded-lg border border-line bg-surface-sunken">
                    <img src={`/api/v1/assets/${image.assetId}`} alt={`${project.title} image ${index + 1}`} loading="lazy" className="aspect-[4/3] w-full object-contain" />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {project.publicAnswers.length > 0 ? (
            <section>
              <h2 className="text-subheading font-semibold text-fg">More about the project</h2>
              <dl className="mt-4 space-y-5">
                {project.publicAnswers.map((item) => (
                  <div key={item.id} className="border-t border-line-subtle pt-4">
                    <dt className="text-small font-semibold text-fg">{item.prompt}</dt>
                    <dd className="mt-1.5 whitespace-pre-wrap text-small leading-6 text-fg-muted">{item.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>

        <aside className="space-y-7 lg:border-l lg:border-line-subtle lg:pl-7">
          {links.length > 0 ? (
            <div>
              <h2 className="text-small font-semibold text-fg">Explore the work</h2>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <a href={link.url!} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-2 rounded-md border border-line px-3 py-2.5 text-small font-medium text-fg transition-colors hover:border-line-strong hover:text-accent-hover">
                      {link.label}<link.icon aria-hidden="true" className="size-4" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {project.techTags.length > 0 ? (
            <div>
              <h2 className="text-small font-semibold text-fg">Built with</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {project.techTags.map((tag) => <li key={tag}><Link href={`/projects?tag=${encodeURIComponent(tag)}`} className="inline-flex rounded-full border border-line bg-surface px-3 py-1 text-caption font-medium text-fg-muted hover:border-accent-border hover:text-accent-hover">{tag}</Link></li>)}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </Page>
  );
}
