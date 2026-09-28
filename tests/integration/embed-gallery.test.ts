import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent, transitionEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as embedGalleryRoute from "../../apps/web/app/embed/gallery/route";

const actorFor = (userId: string): Actor => ({ userId, isPlatformAdmin: false });

describe("embeddable public gallery", () => {
  beforeEach(resetDb);

  it("shows the known submitted fixture but hides drafts and unpublished events", async () => {
    const organizer = await registerUser({
      email: "embed-gallery@example.com",
      password: "password123",
      displayName: "Embed Organizer",
    });
    const actor = actorFor(organizer.id);
    const publicEvent = await createEvent(actor, {
      slug: "embed-public",
      name: "Public Showcase",
      timezone: "UTC",
    });
    await transitionEvent(actor, publicEvent.id, "REGISTRATION");
    const privateEvent = await createEvent(actor, {
      slug: "embed-private",
      name: "Private Event Canary",
      timezone: "UTC",
    });

    async function seedProject(eventId: string, title: string, state: "DRAFT" | "SUBMITTED") {
      const [team] = await db.insert(schema.teams).values({
        eventId,
        name: `${title} Team`,
        createdBy: organizer.id,
      }).returning();
      const [project] = await db.insert(schema.projects).values({
        eventId,
        teamId: team.id,
        slug: title.toLowerCase().replaceAll(" ", "-"),
        state,
        submittedAt: state === "SUBMITTED" ? new Date() : null,
      }).returning();
      const [revision] = await db.insert(schema.projectRevisions).values({
        projectId: project.id,
        revisionNumber: 1,
        title,
        description: `${title} fixture description`,
        createdBy: organizer.id,
      }).returning();
      await db.update(schema.projects).set({ currentRevisionId: revision.id })
        .where(eq(schema.projects.id, project.id));
    }

    await seedProject(publicEvent.id, "Glass Signal", "SUBMITTED");
    await seedProject(publicEvent.id, "Unsubmitted Draft Canary", "DRAFT");
    await seedProject(privateEvent.id, "Private Event Project Canary", "SUBMITTED");

    const response = await embedGalleryRoute.GET(new Request("http://dogfood.local/embed/gallery"));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors *");
    expect(html).toContain("Glass Signal");
    expect(html).not.toContain("Unsubmitted Draft Canary");
    expect(html).not.toContain("Private Event Project Canary");
    expect(html).not.toContain("Private Event Canary");

    const filteredResponse = await embedGalleryRoute.GET(
      new Request("http://dogfood.local/embed/gallery?q=Glass"),
    );
    const filteredHtml = await filteredResponse.text();
    expect(filteredHtml).toContain("value=\"Glass\"");
    expect(filteredHtml).toContain("Glass Signal");
    expect(filteredHtml).not.toContain("Unsubmitted Draft Canary");
  });
});
