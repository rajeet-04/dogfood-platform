import { listPublicGallery, type GalleryFilters } from "@dogfood/submissions";
import { z } from "@dogfood/validation";

const filtersSchema = z.object({
  q: z.string().trim().max(100).optional(),
  event: z.string().uuid().optional(),
  track: z.string().uuid().optional(),
  tag: z.string().trim().max(40).optional(),
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]!);
}

function card(project: Awaited<ReturnType<typeof listPublicGallery>>[number]): string {
  const image = project.thumbnailAssetId
    ? `<img class="project-image" src="/api/v1/assets/${encodeURIComponent(project.thumbnailAssetId)}" alt="" loading="lazy">`
    : `<div class="project-image project-image-fallback" aria-hidden="true">${escapeHtml(project.title)}</div>`;
  const track = project.trackName ? ` · ${escapeHtml(project.trackName)}` : "";
  return `<li><a class="project" href="/projects/${encodeURIComponent(project.id)}" target="_blank" rel="noopener noreferrer">${image}<span class="project-copy"><span class="project-context">${escapeHtml(project.eventName)}${track}</span><strong>${escapeHtml(project.title)}</strong><span class="project-description">${escapeHtml(project.tagline || project.description)}</span><span class="project-team">${escapeHtml(project.teamName)}</span></span></a></li>`;
}

function selectOptions(values: Array<[string, string]>, selected: string, label: string): string {
  const options = values.map(([value, text]) => `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(text)}</option>`);
  if (selected && !values.some(([value]) => value === selected)) {
    options.push(`<option value="${escapeHtml(selected)}" selected>Current selection</option>`);
  }
  return `<option value="">${label}</option>${options.join("")}`;
}

function responseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors *",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  };
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const parsed = filtersSchema.safeParse({
    q: params.get("q") || undefined,
    event: params.get("event") || undefined,
    track: params.get("track") || undefined,
    tag: params.get("tag") || undefined,
  });
  if (!parsed.success) {
    return new Response("Invalid gallery filters", { status: 400, headers: responseHeaders() });
  }

  const filters: GalleryFilters = parsed.data;
  const allProjects = await listPublicGallery();
  const hasFilters = Object.values(filters).some(Boolean);
  const projects = hasFilters ? await listPublicGallery(filters) : allProjects;
  const selected = {
    q: filters.q ?? "",
    event: filters.event ?? "",
    track: filters.track ?? "",
    tag: filters.tag ?? "",
  };
  const events = [...new Map(allProjects.map((project) => [project.eventId, project.eventName] as const)).entries()];
  const tracks = [...new Map(allProjects.filter((project) => project.trackId).map((project) => [project.trackId!, project.trackName!] as const)).entries()];
  const tags = [...new Set(allProjects.flatMap((project) => project.techTags))].sort();
  const eventOptions = selectOptions(events, selected.event, "All events");
  const trackOptions = selectOptions(tracks, selected.track, "All tracks");
  const tagOptions = selectOptions(tags.map((tag) => [tag, tag]), selected.tag, "All technologies");
  const cards = projects.map(card).join("");
  const results = cards
    ? `<p id="result-count" class="result-count" aria-live="polite">${projects.length} project${projects.length === 1 ? "" : "s"}</p><ul id="project-list" class="project-list">${cards}</ul>`
    : `<p id="result-count" class="empty-state" aria-live="polite">${allProjects.length ? "No projects match these filters. Try a different search." : "No submitted projects yet."}</p><ul id="project-list" class="project-list"></ul>`;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>Project gallery · DOGFOOD</title>
  <link rel="stylesheet" href="/embed-gallery.css">
  <script src="/embed-gallery.js" defer></script>
</head>
<body>
  <main class="gallery-embed">
    <header class="gallery-header">
      <h1>Project gallery</h1>
      <a href="/projects" target="_blank" rel="noopener noreferrer">Open full gallery</a>
    </header>
    <form id="gallery-filters" class="filters" action="/embed/gallery" method="get" role="search">
      <label>Search projects<input name="q" value="${escapeHtml(selected.q)}" maxlength="100" placeholder="Title, team, or description"></label>
      <label>Event<select name="event">${eventOptions}</select></label>
      <label>Track<select name="track">${trackOptions}</select></label>
      <label>Technology<select name="tag">${tagOptions}</select></label>
      <button type="submit">Search</button>
    </form>
    <div id="gallery-status" class="sr-only" role="status" aria-live="polite"></div>
    <section aria-label="Submitted projects">${results}</section>
  </main>
</body>
</html>`;
  return new Response(html, { headers: responseHeaders() });
}
