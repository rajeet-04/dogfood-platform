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
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

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
  const team = await createTeam(actorFor(participant.id), event.id, {
    name: "Alpha",
  });
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
        title: "Hack",
        description: "cross-event",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});