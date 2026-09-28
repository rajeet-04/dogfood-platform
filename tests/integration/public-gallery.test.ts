import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { asc, db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import { getPublicGalleryProject, listPublicGallery, reviseProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import * as galleryRoute from "../../apps/web/app/api/v1/gallery/route";
import * as eventGalleryRoute from "../../apps/web/app/api/v1/events/[eventId]/gallery/route";
import * as projectGalleryRoute from "../../apps/web/app/api/v1/events/[eventId]/gallery/[projectId]/route";
import * as projectsRoute from "../../apps/web/app/api/v1/events/[eventId]/projects/route";
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

  it("round-trips participant project fields through create, revision, and public submit", async () => {
    const organizer = await registerUser({ email: "contract-org@example.com", password: "pass", displayName: "Organizer" });
    const participant = await registerUser({ email: "contract-participant@example.com", password: "pass", displayName: "Participant" });
    const session = await createSession(participant.id);
    const participantActor = actor(participant.id);
    const event = await createEvent(actor(organizer.id), { slug: "contract-event", name: "Contract Event", timezone: "UTC" });
    await grantEventMembership(actor(organizer.id), event.id, participant.id, "PARTICIPANT");
    await transitionEvent(actor(organizer.id), event.id, "REGISTRATION");
    const team = await createTeam(participantActor, event.id, { name: "Round Trip" });

    const publicQuestionId = "11111111-1111-4111-8111-111111111111";
    const privateQuestionId = "22222222-2222-4222-8222-222222222222";
    await db.update(schema.events).set({ customQuestions: [
      { id: publicQuestionId, prompt: "What did you build?", required: true, visibility: "PUBLIC", order: 0 },
      { id: privateQuestionId, prompt: "Organizer context", required: false, visibility: "ORGANIZER_ONLY", order: 1 },
    ] }).where(eq(schema.events.id, event.id));
    const [track] = await db.insert(schema.eventTracks).values({ eventId: event.id, name: "Climate" }).returning();
    const assets = await db.insert(schema.assets).values(["one", "two", "three", "four"].map((name) => ({
      eventId: event.id,
      uploadedBy: participant.id,
      storageKey: `contract/${name}`,
      originalName: `${name}.png`,
      mimeType: "image/png",
      byteSize: 10,
      sha256: name.padEnd(64, name),
    }))).returning();
    const [thumbnail, imageOne, imageTwo, revisedThumbnail] = assets;
    await transitionEvent(actor(organizer.id), event.id, "SUBMISSIONS_OPEN");

    const createResponse = await projectsRoute.POST(new Request(`http://localhost/api/v1/events/${event.id}/projects`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `dogfood_session=${session.rawToken}` },
      body: JSON.stringify({
        teamId: team.id,
        title: "Contract v1",
        tagline: "First cut",
        description: "Initial project description",
        repositoryUrl: "https://github.com/example/contract-v1",
        liveUrl: "https://contract-v1.example.com",
        demoVideoUrl: "https://video.example.com/contract-v1",
        techTags: ["TypeScript", "PostgreSQL"],
        trackId: track.id,
        thumbnailAssetId: thumbnail.id,
        imageAssetIds: [imageOne.id, imageTwo.id],
        customAnswers: { [publicQuestionId]: "Initial public answer", [privateQuestionId]: "Initial private answer" },
      }),
    }), { params: Promise.resolve({ eventId: event.id }) });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()).project;
    expect(created.currentRevision).toMatchObject({
      title: "Contract v1",
      repositoryUrl: "https://github.com/example/contract-v1",
      liveUrl: "https://contract-v1.example.com",
      demoVideoUrl: "https://video.example.com/contract-v1",
      techTags: ["TypeScript", "PostgreSQL"],
      trackId: track.id,
      thumbnailAssetId: thumbnail.id,
      customAnswers: { [publicQuestionId]: "Initial public answer", [privateQuestionId]: "Initial private answer" },
    });
    const createdImages = await db.select({ assetId: schema.projectRevisionImages.assetId })
      .from(schema.projectRevisionImages)
      .where(eq(schema.projectRevisionImages.revisionId, created.currentRevision.id))
      .orderBy(asc(schema.projectRevisionImages.position));
    expect(createdImages.map((image) => image.assetId)).toEqual([imageOne.id, imageTwo.id]);
    expect(await getPublicGalleryProject(created.id)).toBeNull();
    const hiddenApiDetail = await projectGalleryRoute.GET(
      new Request(`http://localhost/api/v1/events/${event.id}/gallery/${created.id}`),
      { params: Promise.resolve({ eventId: event.id, projectId: created.id }) },
    );
    expect(hiddenApiDetail.status).toBe(404);

    const revised = await reviseProject(participantActor, event.id, created.id, {
      expectedCurrentRevisionId: created.currentRevision.id,
      title: "Contract v2",
      tagline: "Revised cut",
      description: "Revised project description",
      repositoryUrl: "https://github.com/example/contract-v2",
      liveUrl: "https://contract-v2.example.com",
      demoVideoUrl: "https://video.example.com/contract-v2",
      techTags: ["Rust", "WebAssembly"],
      trackId: track.id,
      thumbnailAssetId: revisedThumbnail.id,
      imageAssetIds: [imageTwo.id, imageOne.id],
      customAnswers: { [publicQuestionId]: "Revised public answer", [privateQuestionId]: "Revised private answer" },
    });
    expect(revised.currentRevision).toMatchObject({
      title: "Contract v2",
      repositoryUrl: "https://github.com/example/contract-v2",
      liveUrl: "https://contract-v2.example.com",
      demoVideoUrl: "https://video.example.com/contract-v2",
      techTags: ["Rust", "WebAssembly"],
      trackId: track.id,
      thumbnailAssetId: revisedThumbnail.id,
      customAnswers: { [publicQuestionId]: "Revised public answer", [privateQuestionId]: "Revised private answer" },
    });
    const revisedImages = await db.select({ assetId: schema.projectRevisionImages.assetId })
      .from(schema.projectRevisionImages)
      .where(eq(schema.projectRevisionImages.revisionId, revised.currentRevision.id))
      .orderBy(asc(schema.projectRevisionImages.position));
    expect(revisedImages.map((image) => image.assetId)).toEqual([imageTwo.id, imageOne.id]);
    expect(await getPublicGalleryProject(created.id)).toBeNull();

    await submitProject(participantActor, event.id, created.id);
    const detail = await getPublicGalleryProject(created.id);
    expect(detail).toMatchObject({
      title: "Contract v2",
      repositoryUrl: "https://github.com/example/contract-v2",
      liveUrl: "https://contract-v2.example.com",
      demoVideoUrl: "https://video.example.com/contract-v2",
      techTags: ["Rust", "WebAssembly"],
      trackId: track.id,
      trackName: "Climate",
      thumbnailAssetId: revisedThumbnail.id,
      publicAnswers: [{ id: publicQuestionId, prompt: "What did you build?", answer: "Revised public answer" }],
    });
    expect(detail?.images.map((image) => image.assetId)).toEqual([imageTwo.id, imageOne.id]);
    expect(JSON.stringify(detail)).not.toContain("Revised private answer");

    const publicApiDetail = await projectGalleryRoute.GET(
      new Request(`http://localhost/api/v1/events/${event.id}/gallery/${created.id}`),
      { params: Promise.resolve({ eventId: event.id, projectId: created.id }) },
    );
    expect(publicApiDetail.status).toBe(200);
    const publicApiProject = (await publicApiDetail.json()).project;
    expect(publicApiProject).toMatchObject({
      repositoryUrl: "https://github.com/example/contract-v2",
      liveUrl: "https://contract-v2.example.com",
      demoVideoUrl: "https://video.example.com/contract-v2",
      techTags: ["Rust", "WebAssembly"],
      trackId: track.id,
      thumbnailAssetId: revisedThumbnail.id,
      publicAnswers: [{ id: publicQuestionId, prompt: "What did you build?", answer: "Revised public answer" }],
    });
    expect(publicApiProject.images.map((image: { assetId: string }) => image.assetId)).toEqual([imageTwo.id, imageOne.id]);
    expect(JSON.stringify(publicApiProject)).not.toContain("Revised private answer");
  });
});
