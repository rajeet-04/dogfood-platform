import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { and, db, eq, schema } from "@dogfood/db";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import type { Actor } from "@dogfood/shared";
import { createProject, lockAllProjects, lockProject, reviseProject, submitProject, withdrawProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let counter = 0;

async function scenario() {
  counter += 1;
  const tag = `sl${counter}`;

  const organizer = await registerUser({
    email: `org@${tag}.test`,
    password: "pass",
    displayName: "Org",
  });
  const participant = await registerUser({
    email: `part@${tag}.test`,
    password: "pass",
    displayName: "Part",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug: `submit-lock-${counter}`,
    name: `Submission Lock ${counter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participant.id,
    "PARTICIPANT",
  );
  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
  // Rosters lock when submissions open, so the team forms during registration.
  const team = await createTeam(actorFor(participant.id), event.id, {
    name: "Team Lock",
  });
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const project = await createProject(actorFor(participant.id), event.id, {
    teamId: team.id,
    title: "Locked Project",
    description: "project under lock test",
  });
  await submitProject(actorFor(participant.id), event.id, project.id);

  return { organizer, participant, event, project };
}

describe("submission locking", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("locks all submitted projects and records the action", async () => {
    const { organizer, event, project } = await scenario();

    const count = await lockAllProjects(actorFor(organizer.id), event.id);
    expect(count).toBe(1);

    const rows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, project.id));
    expect(rows[0].state).toBe("LOCKED");
    expect(rows[0].lockedAt).toBeInstanceOf(Date);

    const audits = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, event.id));
    expect(audits.map((a) => a.action)).toEqual(
      expect.arrayContaining(["project.lock", "project.lock_all"]),
    );
  });

  it("blocks submit, revise, and withdraw after locking", async () => {
    const { organizer, participant, event, project } = await scenario();
    await lockAllProjects(actorFor(organizer.id), event.id);

    await expect(
      submitProject(actorFor(participant.id), event.id, project.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      reviseProject(actorFor(participant.id), event.id, project.id, {
        expectedCurrentRevisionId: project.currentRevision.id,
        title: "New Title",
        description: "new description",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      withdrawProject(actorFor(participant.id), event.id, project.id),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("is idempotent for an already locked project", async () => {
    const { organizer, event, project } = await scenario();
    await lockProject(actorFor(organizer.id), event.id, project.id);
    await lockProject(actorFor(organizer.id), event.id, project.id);
    await expect(lockAllProjects(actorFor(organizer.id), event.id)).resolves.toBe(0);

    const audits = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "project.lock"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("refuses locking to participants", async () => {
    const { participant, event, project } = await scenario();
    await expect(
      lockProject(actorFor(participant.id), event.id, project.id),
    ).rejects.toBeInstanceOf(Error);
  });

  it("refuses to lock a project from a different event", async () => {
    const { organizer, event, project } = await scenario();
    const other = await createEvent(actorFor(organizer.id), {
      slug: `other-${counter}`,
      name: "Other",
      timezone: "UTC",
    });
    await expect(
      lockProject(actorFor(organizer.id), other.id, project.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
