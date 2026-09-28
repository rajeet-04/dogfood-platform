import { and, asc, db, desc, eq, ilike, inArray, ne, or, schema, sql } from "@dogfood/db";

export type GalleryFilters = {
  q?: string | null;
  event?: string | null;
  track?: string | null;
  tag?: string | null;
};

const publicProject = {
  id: schema.projects.id,
  slug: schema.projects.slug,
  state: schema.projects.state,
  submittedAt: schema.projects.submittedAt,
  eventId: schema.events.id,
  eventName: schema.events.name,
  eventSlug: schema.events.slug,
  teamName: schema.teams.name,
  revisionId: schema.projectRevisions.id,
  title: schema.projectRevisions.title,
  tagline: schema.projectRevisions.tagline,
  description: schema.projectRevisions.description,
  repositoryUrl: schema.projectRevisions.repositoryUrl,
  liveUrl: schema.projectRevisions.liveUrl,
  demoVideoUrl: schema.projectRevisions.demoVideoUrl,
  techTags: schema.projectRevisions.techTags,
  trackId: schema.projectRevisions.trackId,
  trackName: schema.eventTracks.name,
  thumbnailAssetId: schema.projectRevisions.thumbnailAssetId,
  customAnswers: schema.projectRevisions.customAnswers,
  questionSnapshot: schema.projectRevisions.questionSnapshot,
  currentQuestions: schema.events.customQuestions,
};

const visible = and(
  inArray(schema.projects.state, ["SUBMITTED", "LOCKED"]),
  ne(schema.events.state, "DRAFT"),
  ne(schema.events.state, "ARCHIVED"),
);

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function publicAnswers(row: {
  customAnswers: Record<string, string>;
  questionSnapshot: typeof schema.projectRevisions.$inferSelect.questionSnapshot;
  currentQuestions: typeof schema.events.$inferSelect.customQuestions;
}) {
  const currentlyPublic = new Set(row.currentQuestions.filter((question) => question.visibility === "PUBLIC").map((question) => question.id));
  return row.questionSnapshot
    .filter((question) => question.visibility === "PUBLIC" && currentlyPublic.has(question.id) && row.customAnswers[question.id])
    .sort((a, b) => a.order - b.order)
    .map((question) => ({ id: question.id, prompt: question.prompt, answer: row.customAnswers[question.id] }));
}

function toPublicProject(row: Awaited<ReturnType<typeof queryPublicProjects>>[number]) {
  const { customAnswers, questionSnapshot, currentQuestions, ...safe } = row;
  return { ...safe, publicAnswers: publicAnswers({ customAnswers, questionSnapshot, currentQuestions }) };
}

function queryPublicProjects(condition: ReturnType<typeof and>) {
  return db.select(publicProject)
    .from(schema.projects)
    .innerJoin(schema.events, eq(schema.events.id, schema.projects.eventId))
    .innerJoin(schema.teams, eq(schema.teams.id, schema.projects.teamId))
    .innerJoin(schema.projectRevisions, eq(schema.projectRevisions.id, schema.projects.currentRevisionId))
    .leftJoin(schema.eventTracks, eq(schema.eventTracks.id, schema.projectRevisions.trackId))
    .where(condition)
    .orderBy(desc(schema.projects.submittedAt), asc(schema.projects.id));
}

export async function listPublicGallery(filters: GalleryFilters = {}) {
  const q = filters.q?.trim();
  const tag = filters.tag?.trim();
  const rows = await queryPublicProjects(and(
    visible,
    filters.event ? eq(schema.events.id, filters.event) : undefined,
    filters.track ? eq(schema.projectRevisions.trackId, filters.track) : undefined,
    tag ? sql`${schema.projectRevisions.techTags} @> ${JSON.stringify([tag])}::jsonb` : undefined,
    q ? or(
      ilike(schema.projectRevisions.title, `%${escapeLike(q)}%`),
      ilike(schema.projectRevisions.tagline, `%${escapeLike(q)}%`),
      ilike(schema.projectRevisions.description, `%${escapeLike(q)}%`),
      ilike(schema.teams.name, `%${escapeLike(q)}%`),
    ) : undefined,
  )).limit(200);
  return rows.map(toPublicProject);
}

export async function getPublicGalleryProject(projectId: string, eventId?: string) {
  const [row] = await queryPublicProjects(and(
    visible,
    eq(schema.projects.id, projectId),
    eventId ? eq(schema.projects.eventId, eventId) : undefined,
  )).limit(1);
  if (!row) return null;

  const images = await db.select({
    assetId: schema.projectRevisionImages.assetId,
    position: schema.projectRevisionImages.position,
  })
    .from(schema.projectRevisionImages)
    .innerJoin(schema.assets, and(
      eq(schema.assets.id, schema.projectRevisionImages.assetId),
      eq(schema.assets.eventId, row.eventId),
    ))
    .where(eq(schema.projectRevisionImages.revisionId, row.revisionId))
    .orderBy(asc(schema.projectRevisionImages.position));

  return { ...toPublicProject(row), images };
}

export type PublicGalleryProject = NonNullable<Awaited<ReturnType<typeof getPublicGalleryProject>>>;
