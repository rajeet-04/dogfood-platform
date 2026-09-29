import { beforeEach, describe, expect, it } from "vitest";

import { appendAuditEvent, queryAudit } from "@dogfood/audit";
import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import {
  assignJudge,
  createJudgeRecusal,
  deleteJudgeRecusal,
} from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam, createTeamInvite, joinTeam } from "@dogfood/teams";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

async function scenario(
  beforeSubmissionsOpen?: (ctx: {
    event: { id: string };
    participantA: Actor;
    participantB: Actor;
    teamAId: string;
  }) => Promise<void>,
) {
  const organizer = await registerUser({
    email: "org@audit.test",
    password: "pass",
    displayName: "Org",
  });
  const participantA = await registerUser({
    email: "participant-a@audit.test",
    password: "pass",
    displayName: "Participant A",
  });
  const participantB = await registerUser({
    email: "participant-b@audit.test",
    password: "pass",
    displayName: "Participant B",
  });
  const judge = await registerUser({
    email: "judge@audit.test",
    password: "pass",
    displayName: "Judge",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug: "audit-event",
    name: "Audit Event",
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participantA.id,
    "PARTICIPANT",
  );
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    participantB.id,
    "PARTICIPANT",
  );
  await grantEventMembership(
    actorFor(organizer.id),
    event.id,
    judge.id,
    "JUDGE",
  );
  // Rosters lock when submissions open, so the team forms during registration.
  const teamA = await createTeam(actorFor(participantA.id), event.id, {
    name: "Team A",
  });

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");

  await beforeSubmissionsOpen?.({
    event,
    participantA: actorFor(participantA.id),
    participantB: actorFor(participantB.id),
    teamAId: teamA.id,
  });

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const projectA = await createProject(actorFor(participantA.id), event.id, {
    teamId: teamA.id,
    title: "Project A",
    description: "first project",
  });
  await submitProject(actorFor(participantA.id), event.id, projectA.id);

  return {
    event,
    organizer: actorFor(organizer.id),
    participantA: actorFor(participantA.id),
    participantB: actorFor(participantB.id),
    judge: actorFor(judge.id),
    teamAId: teamA.id,
    projectAId: projectA.id,
  };
}

async function auditRows(eventId: string) {
  return db
    .select()
    .from(schema.auditEvents)
    .where(eq(schema.auditEvents.eventId, eventId))
    .orderBy(schema.auditEvents.createdAt);
}

describe("transactional audit trail", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rolls back a business mutation and its audit event together", async () => {
    const { event, participantA, projectAId } = await scenario();

    await expect(
      db.transaction(async (tx) => {
        await tx
          .update(schema.projects)
          .set({ submittedAt: new Date("2099-01-01T00:00:00.000Z") })
          .where(eq(schema.projects.id, projectAId));
        await appendAuditEvent(tx, {
          eventId: event.id,
          actorId: participantA.userId,
          action: "project.reopen",
          resourceType: "project",
          resourceId: projectAId,
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const project = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectAId));
    expect(project[0].submittedAt?.toISOString()).not.toBe(
      "2099-01-01T00:00:00.000Z",
    );

    const reopenAudits = (await auditRows(event.id)).filter(
      (row) => row.action === "project.reopen",
    );
    expect(reopenAudits).toHaveLength(0);
  });

  it("persists audit events from event transition, team create/join, project submit, and judge assign", async () => {
    // Rosters lock when submissions open, so the invite is redeemed during
    // registration through the scenario hook.
    const { event, organizer, judge, projectAId } = await scenario(
      async ({ event, participantA, participantB, teamAId }) => {
        const { rawToken } = await createTeamInvite(participantA, teamAId, {});
        const joined = await joinTeam(participantB, event.id, rawToken);
        expect(joined.id).toBe(teamAId);
      },
    );

    const assignment = await assignJudge(organizer, event.id, {
      judgeId: judge.userId,
      projectId: projectAId,
    });
    expect(assignment.projectId).toBe(projectAId);

    const actions = (await auditRows(event.id)).map((row) => row.action);
    expect(actions).toContain("event.transition");
    expect(actions).toContain("team.create");
    expect(actions).toContain("project.submit");
    expect(actions).toContain("team.join");
    expect(actions).toContain("judge.assign");
  });

  it("rejects audit reads for non-organizers", async () => {
    const { event, participantA } = await scenario();

    await expect(queryAudit(participantA, event.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("reads audit events through queryAudit for an organizer", async () => {
    const { event, organizer } = await scenario();

    const rows = await queryAudit(organizer, event.id);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.eventId === event.id)).toBe(true);

    const submits = await queryAudit(organizer, event.id, {
      resourceType: "project",
    });
    expect(submits.some((row) => row.action === "project.submit")).toBe(true);
  });

  it("scopes audit events to the queried event", async () => {
    const { event, organizer } = await scenario();
    const other = await createEvent(organizer, {
      slug: "other-audit-event",
      name: "Other Audit Event",
      timezone: "UTC",
    });

    const own = await queryAudit(organizer, event.id);
    const otherRows = await queryAudit(organizer, other.id);
    expect(own.length).toBeGreaterThan(0);
    // Only the other event's own creation, none of the first event's rows.
    expect(otherRows.map((row) => row.action)).toEqual(["event.create"]);
  });

  it("audits organizer and judge recusals without recording their reason", async () => {
    const { event, organizer, judge, projectAId } = await scenario();
    const secretReason = "Confidential conflict details: private-collab-4821";

    const organizerRecusal = await createJudgeRecusal(organizer, event.id, {
      judgeId: judge.userId,
      projectId: projectAId,
      reason: secretReason,
    });
    await deleteJudgeRecusal(organizer, event.id, organizerRecusal.id);
    await createJudgeRecusal(judge, event.id, {
      judgeId: judge.userId,
      projectId: projectAId,
      reason: secretReason,
    });

    const recusalAudits = (await auditRows(event.id)).filter(
      (row) => row.resourceType === "judge_recusal",
    );
    expect(recusalAudits.map(({ action }) => action)).toEqual([
      "judge.recusal.create",
      "judge.recusal.delete",
      "judge.recusal.create",
    ]);
    expect(recusalAudits.map(({ actorId }) => actorId)).toEqual([
      organizer.userId,
      organizer.userId,
      judge.userId,
    ]);
    expect(JSON.stringify(recusalAudits)).not.toContain(secretReason);
  });

  it("denies audit reads for an event where the caller has no membership", async () => {
    const { organizer } = await scenario();
    const otherOrganizer = await registerUser({
      email: "other-org@audit.test",
      password: "pass",
      displayName: "Other Org",
    });
    const otherEvent = await createEvent(actorFor(otherOrganizer.id), {
      slug: "other-audit-event",
      name: "Other Audit Event",
      timezone: "UTC",
    });

    await expect(queryAudit(organizer, otherEvent.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
