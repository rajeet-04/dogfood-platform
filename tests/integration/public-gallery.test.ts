import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent, transitionEvent } from "@dogfood/events";
import { getPublicGalleryProject, listPublicGallery } from "@dogfood/submissions";

import * as galleryRoute from "../../apps/web/app/api/v1/gallery/route";
import * as eventGalleryRoute from "../../apps/web/app/api/v1/events/[eventId]/gallery/route";
import * as projectGalleryRoute from "../../apps/web/app/api/v1/events/[eventId]/gallery/[projectId]/route";
import { resetDb } from "../fixtures/db";

const actor = (userId: string) => ({ userId, isPlatformAdmin: false });

describe("public project gallery", () => {
  beforeEach(resetDb);

  async function seed() {
    const user = await registerUser({ email: "gallery@example.com", password: "pass", displayName: "Gallery" });
    const event = await createEvent(actor(user.id), { slug: "gallery-event", name: "Gallery Event", timezone: "UTC" });
    const draftEvent = await createEvent(actor(user.id), { slug: "hidden-event", name: "Hidden Event", timezone: "UTC" });
    await transitionEvent(actor(user.id), event.id, "REGISTRATION");
    await db.update(schema.events).set({ customQuestions: [
      { id: "secret", prompt: "Private question", required: false, visibility: "ORGANIZER_ONLY", order: 0 },
      { id: "public", prompt: "Public question", required: false, visibility: "PUBLIC", order: 1 },
    ] }).where(eq(schema.events.id, event.id));
    const [track] = await db.insert(schema.eventTracks).values({ eventId: event.id, name: "Climate" }).returning();
    const [team] = await db.insert(schema.teams).values({ eventId: event.id, name: "North Star", createdBy: user.id }).returning();
    const [secondTeam] = await db.insert(schema.teams).values({ eventId: event.id, name: "Second Team", createdBy: user.id }).returning();
    const [draftTeam] = await db.insert(schema.teams).values({ eventId: draftEvent.id, name: "Hidden Team", createdBy: user.id }).returning();

    async function project(eventId: string, teamId: string, slug: string, state: "DRAFT" | "SUBMITTED") {
      const [row] = await db.insert(schema.projects).values({ eventId, teamId, slug, state, submittedAt: state === "SUBMITTED" ? new Date() : null }).returning();
      const [revision] = await db.insert(schema.projectRevisions).values({
        projectId: row.id,
        revisionNumber: 1,
        title: slug,
        description: `${slug} description`,
        techTags: ["TypeScript"],
        trackId: eventId === event.id ? track.id : null,
        customAnswers: { public: "Visible answer", secret: "PRIVATE ANSWER" },
        questionSnapshot: [
          { id: "secret", prompt: "Private question", required: false, visibility: "ORGANIZER_ONLY", order: 0 },
          { id: "public", prompt: "Public question", required: false, visibility: "PUBLIC", order: 1 },
        ],
        createdBy: user.id,
      }).returning();
      await db.update(schema.projects).set({ currentRevisionId: revision.id }).where(eq(schema.projects.id, row.id));
      return { row, revision };
    }

    const published = await project(event.id, team.id, "Glass Signal", "SUBMITTED");
    const draft = await project(event.id, secondTeam.id, "draft-project", "DRAFT");
    const hidden = await project(draftEvent.id, draftTeam.id, "hidden-project", "SUBMITTED");

    const assets = await db.insert(schema.assets).values([1, 2].map((n) => ({
      eventId: event.id,
      uploadedBy: user.id,
      storageKey: `gallery/${n}`,
      originalName: `${n}.png`,
      mimeType: "image/png",
      byteSize: 10,
      sha256: `${n}`.repeat(64),
    }))).returning();
    await db.insert(schema.projectRevisionImages).values([
      { revisionId: published.revision.id, assetId: assets[0].id, position: 2 },
      { revisionId: published.revision.id, assetId: assets[1].id, position: 1 },
    ]);
    return { event, draftEvent, track, published, draft, hidden, assets };
  }

  it("shows submitted work, supports filters, and hides drafts and private events", async () => {
    const { event, draftEvent, track, published, draft, hidden } = await seed();
    const all = await listPublicGallery();
    expect(all.map((item) => item.id)).toEqual([published.row.id]);
    expect(await listPublicGallery({ q: "glass", event: event.id, track: track.id, tag: "TypeScript" })).toHaveLength(1);
    expect(await listPublicGallery({ q: "missing" })).toEqual([]);
    expect(await listPublicGallery({ event: draftEvent.id })).toEqual([]);
    expect(await getPublicGalleryProject(draft.row.id)).toBeNull();
    expect(await getPublicGalleryProject(hidden.row.id)).toBeNull();
    await db.update(schema.events).set({ state: "ARCHIVED" }).where(eq(schema.events.id, event.id));
    expect(await listPublicGallery()).toEqual([]);
    expect(await getPublicGalleryProject(published.row.id)).toBeNull();
  });

  it("redacts organizer-only answers in service and anonymous API responses", async () => {
    const { event, published, assets } = await seed();
    const detail = await getPublicGalleryProject(published.row.id);
    expect(detail?.publicAnswers).toEqual([{ id: "public", prompt: "Public question", answer: "Visible answer" }]);
    expect(detail?.images.map((image) => image.assetId)).toEqual([assets[1].id, assets[0].id]);
    expect(JSON.stringify(detail)).not.toContain("PRIVATE ANSWER");

    const listResponse = await galleryRoute.GET(new Request("http://localhost/api/v1/gallery?q=glass"));
    expect(listResponse.status).toBe(200);
    expect(JSON.stringify(await listResponse.json())).not.toContain("PRIVATE ANSWER");

    const eventResponse = await eventGalleryRoute.GET(new Request(`http://localhost/api/v1/events/${event.id}/gallery`), { params: Promise.resolve({ eventId: event.id }) });
    expect(eventResponse.status).toBe(200);
    expect((await eventResponse.json()).projects).toHaveLength(1);

    const detailResponse = await projectGalleryRoute.GET(new Request(`http://localhost/api/v1/events/${event.id}/gallery/${published.row.id}`), { params: Promise.resolve({ eventId: event.id, projectId: published.row.id }) });
    expect(detailResponse.status).toBe(200);
    expect(JSON.stringify(await detailResponse.json())).not.toContain("PRIVATE ANSWER");

    const wrongEventResponse = await projectGalleryRoute.GET(new Request(`http://localhost/api/v1/events/${event.id}/gallery/${published.row.id}`), { params: Promise.resolve({ eventId: "00000000-0000-4000-8000-000000000000", projectId: published.row.id }) });
    expect(wrongEventResponse.status).toBe(404);

    await db.update(schema.events).set({ customQuestions: [
      { id: "secret", prompt: "Private question", required: false, visibility: "ORGANIZER_ONLY", order: 0 },
      { id: "public", prompt: "Public question", required: false, visibility: "ORGANIZER_ONLY", order: 1 },
    ] }).where(eq(schema.events.id, event.id));
    expect((await getPublicGalleryProject(published.row.id))?.publicAnswers).toEqual([]);
  });
});
