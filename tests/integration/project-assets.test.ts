import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { deleteUpload, resolveUploadPath } from "../../apps/web/lib/uploads";
import * as uploadRoute from "../../apps/web/app/api/v1/events/[eventId]/assets/route";
import * as imageRoute from "../../apps/web/app/api/v1/assets/[assetId]/route";
import { resetDb } from "../fixtures/db";

const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
let number = 0;
const storedKeys: string[] = [];

async function user(label: string) {
  number += 1;
  const registered = await registerUser({
    email: `${label}-asset-${number}@example.com`,
    password: "password123",
    displayName: label,
  });
  const session = await createSession(registered.id);
  return {
    actor: { userId: registered.id, isPlatformAdmin: false } satisfies Actor,
    cookie: `dogfood_session=${session.rawToken}`,
  };
}

function uploadRequest(eventId: string, cookie: string | undefined, bytes = png, type = "image/png") {
  const form = new FormData();
  form.set("file", new File([bytes], "screenshot.png", { type }));
  return new Request(`http://dogfood.local/api/v1/events/${eventId}/assets`, {
    method: "POST",
    headers: cookie ? { cookie } : {},
    body: form,
  });
}

async function upload(eventId: string, cookie: string | undefined, bytes = png, type = "image/png") {
  return uploadRoute.POST(uploadRequest(eventId, cookie, bytes, type), { params: Promise.resolve({ eventId }) });
}

async function read(assetId: string, cookie?: string) {
  return imageRoute.GET(new Request(`http://dogfood.local/api/v1/assets/${assetId}`, {
    headers: cookie ? { cookie } : {},
  }), { params: Promise.resolve({ assetId }) });
}

afterEach(async () => {
  await Promise.all(storedKeys.splice(0).map(deleteUpload));
});

describe("project image assets", () => {
  it("checks membership and image bytes, then persists a SHA256 checked local asset", async () => {
    await resetDb();
    const organizer = await user("organizer");
    const participant = await user("participant");
    const event = await createEvent(organizer.actor, { slug: `image-access-${number}`, name: "Images", timezone: "UTC" });
    await grantEventMembership(organizer.actor, event.id, participant.actor.userId, "PARTICIPANT");

    expect((await upload(event.id, undefined)).status).toBe(401);
    expect((await upload(event.id, participant.cookie)).status).toBe(403);
    expect((await upload(event.id, organizer.cookie, Buffer.from("not an image"), "image/png")).status).toBe(422);
    expect((await upload(event.id, organizer.cookie, Buffer.alloc(5 * 1024 * 1024 + 1), "image/png")).status).toBe(422);

    const response = await upload(event.id, organizer.cookie, png, "application/octet-stream");
    expect(response.status).toBe(201);
    const { asset } = await response.json();
    expect(asset).toMatchObject({ eventId: event.id, mimeType: "image/png", byteSize: png.length });
    expect(asset.sha256).toBe(createHash("sha256").update(png).digest("hex"));

    const [record] = await db.select().from(schema.assets).where(eq(schema.assets.id, asset.id));
    expect(record.storageKey).toMatch(new RegExp(`^events/${event.id}/images/`));
    storedKeys.push(record.storageKey);
    expect(await readFile(resolveUploadPath(record.storageKey))).toEqual(png);
    expect((await read(asset.id)).status).toBe(404);
    const ownerRead = await read(asset.id, organizer.cookie);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.headers.get("x-content-type-options")).toBe("nosniff");

    await db.update(schema.eventMemberships).set({ isActive: false }).where(eq(
      schema.eventMemberships.eventId,
      event.id,
    ));
    expect((await read(asset.id, organizer.cookie)).status).toBe(404);
  });

  it("serves only images linked to a current submitted revision of a public event", async () => {
    await resetDb();
    const organizer = await user("organizer");
    const participant = await user("participant");
    const event = await createEvent(organizer.actor, { slug: `image-public-${number}`, name: "Images", timezone: "UTC" });
    await grantEventMembership(organizer.actor, event.id, participant.actor.userId, "PARTICIPANT");
    await transitionEvent(organizer.actor, event.id, "REGISTRATION");
    const team = await createTeam(participant.actor, event.id, { name: "Image Team" });
    const uploaded = await upload(event.id, participant.cookie);
    expect(uploaded.status).toBe(201);
    const { asset } = await uploaded.json();
    const [record] = await db.select().from(schema.assets).where(eq(schema.assets.id, asset.id));
    storedKeys.push(record.storageKey);

    await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_OPEN");
    const project = await createProject(participant.actor, event.id, {
      teamId: team.id,
      title: "Camera",
      description: "A project with images",
    });
    await db.insert(schema.projectRevisionImages).values({
      revisionId: project.currentRevision.id,
      assetId: asset.id,
      position: 0,
    });
    expect((await read(asset.id)).status).toBe(404);
    await submitProject(participant.actor, event.id, project.id);
    const visible = await read(asset.id);
    expect(visible.status).toBe(200);
    expect(visible.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await visible.arrayBuffer())).toEqual(png);

    await db.update(schema.projects).set({ state: "DRAFT" }).where(eq(schema.projects.id, project.id));
    expect((await read(asset.id)).status).toBe(404);
    await db.update(schema.projects).set({ state: "SUBMITTED" }).where(eq(schema.projects.id, project.id));
    await db.update(schema.events).set({ state: "DRAFT" }).where(eq(schema.events.id, event.id));
    expect((await read(asset.id)).status).toBe(404);
    await db.update(schema.events).set({ state: "SUBMISSIONS_OPEN" }).where(eq(schema.events.id, event.id));
    await db.update(schema.projects).set({ currentRevisionId: null }).where(eq(schema.projects.id, project.id));
    expect((await read(asset.id)).status).toBe(404);
  });

  it("serves a current submitted revision thumbnail anonymously", async () => {
    await resetDb();
    const organizer = await user("organizer");
    const participant = await user("participant");
    const event = await createEvent(organizer.actor, { slug: `image-thumbnail-${number}`, name: "Thumbnails", timezone: "UTC" });
    await grantEventMembership(organizer.actor, event.id, participant.actor.userId, "PARTICIPANT");
    await transitionEvent(organizer.actor, event.id, "REGISTRATION");
    const team = await createTeam(participant.actor, event.id, { name: "Thumbnail Team" });
    const uploaded = await upload(event.id, participant.cookie);
    expect(uploaded.status).toBe(201);
    const { asset } = await uploaded.json();
    const [record] = await db.select().from(schema.assets).where(eq(schema.assets.id, asset.id));
    storedKeys.push(record.storageKey);

    await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_OPEN");
    const project = await createProject(participant.actor, event.id, {
      teamId: team.id,
      title: "Thumbnail",
      description: "A submitted project with a thumbnail",
      thumbnailAssetId: asset.id,
    });
    await submitProject(participant.actor, event.id, project.id);

    const response = await read(asset.id);
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
  });
});
