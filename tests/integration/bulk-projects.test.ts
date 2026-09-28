import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { createWebhookEndpoint } from "@dogfood/audit";
import { createSession, registerUser } from "@dogfood/auth";
import { and, db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";
import { createProject, reviseProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { GET, POST } from "../../apps/web/app/api/v1/events/[eventId]/bulk/projects/route";
import { exportProjectArchive, importProjectArchive } from "../../packages/exports/src/bulk-projects";
import { resetDb } from "../fixtures/db";

let id = 0;

async function user(prefix: string) {
  id += 1;
  const account = await registerUser({ email: `${prefix}-${Date.now()}-${id}@bulk.test`, password: "password123", displayName: prefix });
  const session = await createSession(account.id);
  return { actor: { userId: account.id, isPlatformAdmin: false } satisfies Actor, cookie: `dogfood_session=${session.rawToken}` };
}

async function event(organizer: Actor, slug: string) {
  return createEvent(organizer, {
    slug: `${slug}-${Date.now()}-${++id}`,
    name: "Bulk archive test",
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60_000),
  });
}

function request(eventId: string, method: "GET" | "POST", cookie: string | undefined, body?: string, contentType = "application/json") {
  return new Request(`http://dogfood.local/api/v1/events/${eventId}/bulk/projects`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": contentType } : {}) },
    body,
  });
}

describe("event project archives", () => {
  beforeEach(async () => { await resetDb(); });

  it("restores versioned CSV and JSON archives with full revisions and strict organizer access", async () => {
    const organizer = await user("org");
    const participant = await user("participant");
    const source = await event(organizer.actor, "bulk-source");
    await grantEventMembership(organizer.actor, source.id, participant.actor.userId, "PARTICIPANT");
    const team = await createTeam(participant.actor, source.id, { name: "Archive team" });
    await transitionEvent(organizer.actor, source.id, "REGISTRATION");
    await transitionEvent(organizer.actor, source.id, "SUBMISSIONS_OPEN");
    const created = await createProject(participant.actor, source.id, {
      teamId: team.id,
      slug: "quoted-project",
      title: "Quoted, project",
      description: 'First line, with "quotes"\nand a second line.',
      techTags: ["TypeScript", "CSV"],
    });
    const revised = await reviseProject(participant.actor, source.id, created.id, {
      expectedCurrentRevisionId: created.currentRevision.id,
      title: "Quoted, project v2",
      description: 'Revised description, with "quotes" and\nnew lines.',
      repositoryUrl: "https://example.com/repo",
      techTags: ["TypeScript", "Import / export"],
    });
    expect(revised.currentRevision.revisionNumber).toBe(2);
    const sourceArchive = await exportProjectArchive(organizer.actor, source.id);
    expect(sourceArchive.projects[0]?.revisions).toHaveLength(2);

    const target = await event(organizer.actor, "bulk-target");
    await grantEventMembership(organizer.actor, target.id, participant.actor.userId, "PARTICIPANT");
    const targetTeam = await createTeam(participant.actor, target.id, { name: "Archive team" });
    const { endpoint } = await createWebhookEndpoint(organizer.actor, target.id, {
      url: "https://hooks.example.com/dogfood",
      eventTypes: ["projects.bulk_import"],
    });
    const jsonArchive = structuredClone(sourceArchive);
    jsonArchive.eventId = target.id;
    jsonArchive.projects[0]!.teamId = targetTeam.id;
    jsonArchive.projects[0]!.id = randomUUID();
    jsonArchive.projects[0]!.currentRevisionId = randomUUID();
    for (const revision of jsonArchive.projects[0]!.revisions) revision.id = randomUUID();
    jsonArchive.projects[0]!.currentRevisionId = jsonArchive.projects[0]!.revisions.at(-1)!.id;

    const unauthenticated = await POST(request(target.id, "POST", undefined, JSON.stringify(jsonArchive)), { params: Promise.resolve({ eventId: target.id }) });
    expect(unauthenticated.status).toBe(401);
    const participantSession = await createSession(participant.actor.userId);
    const forbidden = await POST(request(target.id, "POST", `dogfood_session=${participantSession.rawToken}`, JSON.stringify(jsonArchive)), { params: Promise.resolve({ eventId: target.id }) });
    expect(forbidden.status).toBe(403);

    const restored = await POST(request(target.id, "POST", organizer.cookie, JSON.stringify(jsonArchive)), { params: Promise.resolve({ eventId: target.id }) });
    expect(restored.status).toBe(201);
    expect(await restored.json()).toEqual({ imported: 1 });
    expect(await db.select().from(schema.webhookDeliveries).where(eq(schema.webhookDeliveries.endpointId, endpoint.id))).toHaveLength(1);
    const stored = await exportProjectArchive(organizer.actor, target.id);
    expect(stored.projects[0]!.revisions.map(({ title, description, techTags }) => ({ title, description, techTags })))
      .toEqual(sourceArchive.projects[0]!.revisions.map(({ title, description, techTags }) => ({ title, description, techTags })));
    expect(stored.projects[0]!.currentRevisionId).toBe(jsonArchive.projects[0]!.currentRevisionId);

    await db.delete(schema.projects).where(eq(schema.projects.id, jsonArchive.projects[0]!.id));
    const csvResponse = await GET(new Request(`http://dogfood.local/api/v1/events/${source.id}/bulk/projects?format=csv`, { headers: { cookie: organizer.cookie } }), { params: Promise.resolve({ eventId: source.id }) });
    expect(csvResponse.status).toBe(200);
    const csvBody = await csvResponse.text();
    let remappedCsv = csvBody.replaceAll(team.id, targetTeam.id).replaceAll(created.id, randomUUID());
    for (const revision of sourceArchive.projects[0]!.revisions) remappedCsv = remappedCsv.replaceAll(revision.id, randomUUID());
    const importedCsv = await POST(request(target.id, "POST", organizer.cookie, remappedCsv, "text/csv; charset=utf-8"), { params: Promise.resolve({ eventId: target.id }) });
    expect(importedCsv.status).toBe(201);
    expect(await importedCsv.json()).toEqual({ imported: 1 });
    const rows = await db.select().from(schema.projects).where(and(eq(schema.projects.eventId, target.id), eq(schema.projects.slug, "quoted-project")));
    expect(rows).toHaveLength(1);
  });

  it("rejects imports that point to another event or claim missing required data", async () => {
    const organizer = await user("org");
    const participant = await user("participant");
    const source = await event(organizer.actor, "bulk-reject-source");
    await grantEventMembership(organizer.actor, source.id, participant.actor.userId, "PARTICIPANT");
    const team = await createTeam(participant.actor, source.id, { name: "Only team" });
    await transitionEvent(organizer.actor, source.id, "REGISTRATION");
    await transitionEvent(organizer.actor, source.id, "SUBMISSIONS_OPEN");
    await createProject(participant.actor, source.id, { teamId: team.id, slug: "incomplete", title: "Draft", description: "Draft" });
    const archive = await exportProjectArchive(organizer.actor, source.id);
    const wrongEvent = await importProjectArchive(organizer.actor, randomUUID(), archive).catch((error) => error);
    expect(wrongEvent).toMatchObject({ code: "NOT_FOUND" });
    const tampered = structuredClone(archive);
    tampered.projects[0]!.state = "SUBMITTED";
    const target = await event(organizer.actor, "bulk-reject-target");
    await grantEventMembership(organizer.actor, target.id, participant.actor.userId, "PARTICIPANT");
    const targetTeam = await createTeam(participant.actor, target.id, { name: "Only team" });
    await expect(importProjectArchive(organizer.actor, target.id, archive)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    tampered.eventId = target.id;
    tampered.projects[0]!.teamId = targetTeam.id;
    tampered.projects[0]!.id = randomUUID();
    tampered.projects[0]!.currentRevisionId = randomUUID();
    tampered.projects[0]!.revisions[0]!.id = tampered.projects[0]!.currentRevisionId;
    tampered.projects[0]!.revisions[0]!.title = "";
    await expect(importProjectArchive(organizer.actor, target.id, tampered)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects imports that would add submitted projects after event publication", async () => {
    const organizer = await user("org");
    const participant = await user("participant");
    const source = await event(organizer.actor, "bulk-published-source");
    await grantEventMembership(organizer.actor, source.id, participant.actor.userId, "PARTICIPANT");
    const sourceTeam = await createTeam(participant.actor, source.id, { name: "Source event team" });
    await transitionEvent(organizer.actor, source.id, "REGISTRATION");
    await transitionEvent(organizer.actor, source.id, "SUBMISSIONS_OPEN");
    const project = await createProject(participant.actor, source.id, {
      teamId: sourceTeam.id,
      slug: "submitted-before-publication",
      title: "Original project",
      description: "A submitted project to include in the export archive.",
    });
    await submitProject(participant.actor, source.id, project.id);
    const archive = await exportProjectArchive(organizer.actor, source.id);

    const target = await event(organizer.actor, "bulk-published-target");
    await grantEventMembership(organizer.actor, target.id, participant.actor.userId, "PARTICIPANT");
    const targetTeam = await createTeam(participant.actor, target.id, { name: "Published event team" });
    archive.eventId = target.id;
    const lateProject = archive.projects[0]!;
    lateProject.id = randomUUID();
    lateProject.teamId = targetTeam.id;
    lateProject.slug = "late-imported-project";
    for (const revision of lateProject.revisions) revision.id = randomUUID();
    lateProject.currentRevisionId = lateProject.revisions.at(-1)!.id;

    await transitionEvent(organizer.actor, target.id, "REGISTRATION");
    await transitionEvent(organizer.actor, target.id, "SUBMISSIONS_OPEN");
    await transitionEvent(organizer.actor, target.id, "SUBMISSIONS_CLOSED");
    await transitionEvent(organizer.actor, target.id, "JUDGING");
    await transitionEvent(organizer.actor, target.id, "RESULTS_READY");
    await transitionEvent(organizer.actor, target.id, "PUBLISHED");

    const response = await POST(
      request(target.id, "POST", organizer.cookie, JSON.stringify(archive)),
      { params: Promise.resolve({ eventId: target.id }) },
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "CONFLICT" } });
    const importedProjects = await db.select().from(schema.projects)
      .where(and(eq(schema.projects.eventId, target.id), eq(schema.projects.slug, "late-imported-project")));
    expect(importedProjects).toHaveLength(0);
  });
});
