import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import { createTeam } from "@dogfood/teams";
import {
  createProject,
  reviseProject,
  submitProject,
  withdrawProject,
} from "@dogfood/submissions";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

async function eventInSubmissions(overrides?: {
  closesInMs?: number;
  opensInMs?: number;
}) {
  const organizer = await registerUser({
    email: "org@example.com",
    password: "pass",
    displayName: "Org",
  });
  const event = await createEvent(actorFor(organizer.id), {
    slug: "submissions-event",
    name: "Submissions Event",
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() + (overrides?.opensInMs ?? -60_000)),
    submissionClosesAt: new Date(
      Date.now() + (overrides?.closesInMs ?? 24 * 60 * 60 * 1000),
    ),
  });
  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");

  const participant = await registerUser({
    email: "participant@example.com",
    password: "pass",
    displayName: "Participant",
  });
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participant.id,
    "PARTICIPANT",
  );
  // Rosters lock when submissions open, so the team forms during registration.
  const team = await createTeam(actorFor(participant.id), event.id, {
    name: "Alpha",
  });
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");
  return {
    event,
    organizer: actorFor(organizer.id),
    participant: actorFor(participant.id),
    teamId: team.id,
  };
}

describe("projects and immutable revisions", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a project with revision 1", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const project = await createProject(participant, event.id, {
      teamId,
      title: "Hello Hackathon",
      description: "A tiny project",
      tagline: "wow",
    });

    expect(project.state).toBe("DRAFT");
    expect(project.currentRevision.revisionNumber).toBe(1);
    expect(project.currentRevision.title).toBe("Hello Hackathon");
  });

  it("keeps earlier revisions immutable and points to the newest", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const project = await createProject(participant, event.id, {
      teamId,
      title: "First Title",
      description: "first body",
      tagline: "original tagline",
    });
    const revised = await reviseProject(participant, event.id, project.id, {
      expectedCurrentRevisionId: project.currentRevision.id,
      title: "Second Title",
      description: "second body",
      tagline: "revised tagline",
    });

    expect(revised.id).toBe(project.id);
    expect(revised.currentRevision.revisionNumber).toBe(2);
    expect(revised.currentRevision.title).toBe("Second Title");

    const revisions = await db
      .select()
      .from(schema.projectRevisions)
      .where(eq(schema.projectRevisions.projectId, project.id))
      .orderBy(schema.projectRevisions.revisionNumber);
    expect(revisions).toHaveLength(2);

    const [rev1, rev2] = revisions;
    expect(rev1.revisionNumber).toBe(1);
    expect(rev1.title).toBe("First Title");
    expect(rev1.tagline).toBe("original tagline");
    expect(rev1.description).toBe("first body");
    expect(rev2.revisionNumber).toBe(2);
    expect(rev2.title).toBe("Second Title");
    expect(rev2.tagline).toBe("revised tagline");

    const persisted = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id))
      .limit(1);
    expect(persisted[0].currentRevisionId).toBe(rev2.id);
  });

  it("rejects a save based on a stale revision without overwriting the latest", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const project = await createProject(participant, event.id, {
      teamId,
      title: "First title",
      description: "first body",
    });
    const latest = await reviseProject(participant, event.id, project.id, {
      expectedCurrentRevisionId: project.currentRevision.id,
      title: "Latest title",
      description: "latest body",
    });

    await expect(reviseProject(participant, event.id, project.id, {
      expectedCurrentRevisionId: project.currentRevision.id,
      title: "Stale title",
      description: "stale body",
    })).rejects.toMatchObject({ code: "CONFLICT" });

    const [persisted] = await db.select().from(schema.projects).where(eq(schema.projects.id, project.id));
    expect(persisted.currentRevisionId).toBe(latest.currentRevision.id);
    const revisions = await db.select().from(schema.projectRevisions)
      .where(eq(schema.projectRevisions.projectId, project.id));
    expect(revisions).toHaveLength(2);
  });

  it("submits and withdraws a project within the window", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const project = await createProject(participant, event.id, {
      teamId,
      title: "Submittable",
      description: "full project",
    });

    const submitted = await submitProject(participant, event.id, project.id);
    expect(submitted.state).toBe("SUBMITTED");
    expect(submitted.submittedAt).toBeInstanceOf(Date);

    const withdrawn = await withdrawProject(participant, event.id, project.id);
    expect(withdrawn.state).toBe("DRAFT");
    expect(withdrawn.submittedAt).toBeNull();
  });

  it("requires current organizer questions at submit while allowing partial drafts", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    await db.update(schema.events).set({ customQuestions: [
      { id: "impact", prompt: "What is the impact?", required: true, visibility: "PUBLIC", order: 0 },
      { id: "notes", prompt: "Notes", required: false, visibility: "ORGANIZER_ONLY", order: 1 },
    ] }).where(eq(schema.events.id, event.id));
    const project = await createProject(participant, event.id, {
      teamId, title: "Answers", description: "A project", customAnswers: {},
    });
    await expect(submitProject(participant, event.id, project.id)).rejects.toMatchObject({ code: "SUBMISSION_INCOMPLETE" });
    const revised = await reviseProject(participant, event.id, project.id, {
      expectedCurrentRevisionId: project.currentRevision.id,
      title: "Answers", description: "A project", customAnswers: { impact: "Useful" },
    });
    expect(revised.currentRevision.customAnswers).toEqual({ impact: "Useful" });
    await expect(submitProject(participant, event.id, project.id)).resolves.toMatchObject({ state: "SUBMITTED" });
  });

  it("rejects tracks and image assets owned by another event", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const otherOrg = await registerUser({ email: "foreign-org@example.com", password: "pass", displayName: "Foreign Org" });
    const otherEvent = await createEvent(actorFor(otherOrg.id), { slug: "foreign-event", name: "Foreign Event", timezone: "UTC" });
    const [track] = await db.insert(schema.eventTracks).values({ eventId: otherEvent.id, name: "Other Track" }).returning();
    const [asset] = await db.insert(schema.assets).values({ eventId: otherEvent.id, uploadedBy: otherOrg.id, storageKey: "foreign/image.png", originalName: "image.png", mimeType: "image/png", byteSize: 8, sha256: "a" }).returning();
    await expect(createProject(participant, event.id, { teamId, title: "Foreign Track", description: "body", trackId: track.id })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(createProject(participant, event.id, { teamId, title: "Foreign Image", description: "body", imageAssetIds: [asset.id] })).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("rejects writes once the deadline has passed", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const project = await createProject(participant, event.id, {
      teamId,
      title: "Late",
      description: "too late",
    });

    await db
      .update(schema.events)
      .set({ submissionClosesAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.events.id, event.id));

    await expect(
      reviseProject(participant, event.id, project.id, {
        expectedCurrentRevisionId: project.currentRevision.id,
        title: "Late Edit",
        description: "nope",
      }),
    ).rejects.toMatchObject({ code: "DEADLINE_PASSED" });

    await expect(
      submitProject(participant, event.id, project.id),
    ).rejects.toMatchObject({ code: "DEADLINE_PASSED" });
  });

  it("allows only one project per team per event", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    await createProject(participant, event.id, {
      teamId,
      title: "First",
      description: "one",
    });

    await expect(
      createProject(participant, event.id, {
        teamId,
        title: "Second",
        description: "two",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a non-participant creating a project", async () => {
    const { event, organizer, teamId } = await eventInSubmissions();
    await expect(
      createProject(organizer, event.id, {
        teamId,
        title: "Sneaky",
        description: "organizer attempt",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies managing a project from another event", async () => {
    const { event, participant, teamId } = await eventInSubmissions();
    const project = await createProject(participant, event.id, {
      teamId,
      title: "Mine",
      description: "mine",
    });

    const otherOrg = await registerUser({
      email: "other-org@example.com",
      password: "pass",
      displayName: "OtherOrg",
    });
    const otherEvent = await createEvent(actorFor(otherOrg.id), {
      slug: "other-event",
      name: "Other Event",
      timezone: "UTC",
    });

    await expect(
      reviseProject(actorFor(otherOrg.id), otherEvent.id, project.id, {
        expectedCurrentRevisionId: project.currentRevision.id,
        title: "Hack",
        description: "cross-event",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
