import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import {
  assignJudge,
  assignJudges,
  createJudgeRecusal,
  generateAssignmentProposal,
  commitAssignmentProposal,
} from "@dogfood/judging";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

async function setupJudging() {
  const organizerUser = await registerUser({ email: "gen-org@judging.test", password: "pass", displayName: "Org" });
  const participantA = await registerUser({ email: "gen-p-a@judging.test", password: "pass", displayName: "A" });
  const participantB = await registerUser({ email: "gen-p-b@judging.test", password: "pass", displayName: "B" });
  const judgeA = await registerUser({ email: "gen-j-a@judging.test", password: "pass", displayName: "JA" });
  const judgeB = await registerUser({ email: "gen-j-b@judging.test", password: "pass", displayName: "JB" });
  const organizer = actorFor(organizerUser.id);
  const event = await createEvent(organizer, {
    slug: `assign-${Date.now()}`,
    name: "Assignment generation",
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });
  for (const participant of [participantA, participantB]) {
    await grantEventMembership(organizer, event.id, participant.id, "PARTICIPANT");
  }
  for (const judge of [judgeA, judgeB]) {
    await grantEventMembership(organizer, event.id, judge.id, "JUDGE");
  }
  const teamA = await createTeam(actorFor(participantA.id), event.id, { name: "Team A" });
  const teamB = await createTeam(actorFor(participantB.id), event.id, { name: "Team B" });
  await transitionEvent(organizer, event.id, "REGISTRATION");
  await transitionEvent(organizer, event.id, "SUBMISSIONS_OPEN");
  const projectA = await createProject(actorFor(participantA.id), event.id, {
    teamId: teamA.id,
    title: "Project A",
    description: "A",
  });
  const projectB = await createProject(actorFor(participantB.id), event.id, {
    teamId: teamB.id,
    title: "Project B",
    description: "B",
  });
  await submitProject(actorFor(participantA.id), event.id, projectA.id);
  await submitProject(actorFor(participantB.id), event.id, projectB.id);
  await transitionEvent(organizer, event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(organizer, event.id, "JUDGING");
  return {
    event,
    organizer,
    judgeA: actorFor(judgeA.id),
    judgeB: actorFor(judgeB.id),
    projectAId: projectA.id,
    projectBId: projectB.id,
  };
}

describe("judge assignment generation", () => {
  beforeEach(async () => resetDb());

  it("rejects a manual assignment when the judge is recused", async () => {
    const { event, organizer, judgeA, projectAId } = await setupJudging();
    await createJudgeRecusal(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
      reason: "Prior collaboration",
    });
    await expect(
      assignJudge(organizer, event.id, { judgeId: judgeA.userId, projectId: projectAId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("does not allow declaring a recusal for an already assigned pair", async () => {
    const { event, organizer, judgeA, projectAId } = await setupJudging();
    await assignJudge(organizer, event.id, { judgeId: judgeA.userId, projectId: projectAId });
    await expect(
      createJudgeRecusal(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
        reason: "Prior collaboration",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("allows a judge to recuse themselves but not another judge", async () => {
    const { event, judgeA, judgeB, projectAId } = await setupJudging();
    const recusal = await createJudgeRecusal(judgeA, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
      reason: "Prior collaboration",
    });
    expect(recusal.judgeId).toBe(judgeA.userId);
    await expect(
      createJudgeRecusal(judgeA, event.id, {
        judgeId: judgeB.userId,
        projectId: projectAId,
        reason: "Trying to recuse another judge",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["assignment-first", "recusal-first"] as const)(
    "serializes concurrent assignment and recusal when %s is invoked first",
    async (first) => {
      const { event, organizer, judgeA, projectAId } = await setupJudging();
      const assignment = () => assignJudge(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
      });
      const recusal = () => createJudgeRecusal(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
        reason: "Concurrent declaration",
      });
      const results = first === "assignment-first"
        ? await Promise.allSettled([assignment(), recusal()])
        : await Promise.allSettled([recusal(), assignment()]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
      const [assignments, recusals] = await Promise.all([
        db.select().from(schema.judgeAssignments).where(eq(schema.judgeAssignments.eventId, event.id)),
        db.select().from(schema.judgeRecusals).where(eq(schema.judgeRecusals.eventId, event.id)),
      ]);
      expect(assignments.some((row) => row.judgeId === judgeA.userId && row.projectId === projectAId)).toBe(
        !recusals.some((row) => row.judgeId === judgeA.userId && row.projectId === projectAId),
      );
    },
  );

  it("rejects inactive judge memberships for assignments and recusals", async () => {
    const { event, organizer, judgeA, projectAId } = await setupJudging();
    await db
      .update(schema.eventMemberships)
      .set({ isActive: false })
      .where(eq(schema.eventMemberships.userId, judgeA.userId));
    await expect(
      assignJudge(organizer, event.id, { judgeId: judgeA.userId, projectId: projectAId }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      createJudgeRecusal(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
        reason: "Inactive judge",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("blocks assignment and event transition behind the event row lock", async () => {
    const { event, organizer, judgeA, projectAId } = await setupJudging();
    let release!: () => void;
    let lockAcquired!: () => void;
    const acquired = new Promise<void>((resolve) => { lockAcquired = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    let assignmentSettled = false;
    let transitionSettled = false;
    let assignmentResult: Promise<unknown> | undefined;
    let transitionResult: Promise<unknown> | undefined;
    const holder = db.transaction(async (tx) => {
      await tx
        .update(schema.events)
        .set({ updatedAt: new Date() })
        .where(eq(schema.events.id, event.id));
      lockAcquired();
      await held;
    });
    await acquired;
    assignmentResult = assignJudge(organizer, event.id, {
      judgeId: judgeA.userId,
      projectId: projectAId,
    }).finally(() => { assignmentSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 40));
    transitionResult = transitionEvent(organizer, event.id, "RESULTS_READY")
      .finally(() => { transitionSettled = true; });
    await new Promise((resolve) => setTimeout(resolve, 40));
    const blockedWhileEventLocked = !assignmentSettled && !transitionSettled;
    release();
    await holder;
    const [assignmentOutcome, transitionOutcome] = await Promise.allSettled([
      assignmentResult,
      transitionResult,
    ]);
    expect(blockedWhileEventLocked).toBe(true);
    expect(assignmentOutcome.status).toBe("fulfilled");
    expect(transitionOutcome.status).toBe("fulfilled");
  });

  it("rejects manual, batch, and generated assignments after results are ready", async () => {
    const { event, organizer, judgeA, judgeB, projectAId } = await setupJudging();
    const input = {
      judgeIds: [judgeA.userId, judgeB.userId],
      reviewsPerProject: 1,
      strategy: "round_robin" as const,
    };
    const preview = await generateAssignmentProposal(organizer, event.id, input);
    await transitionEvent(organizer, event.id, "RESULTS_READY");
    await expect(
      assignJudge(organizer, event.id, { judgeId: judgeA.userId, projectId: projectAId }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      assignJudges(organizer, event.id, [{ judgeId: judgeA.userId, projectId: projectAId }]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      commitAssignmentProposal(organizer, event.id, { ...input, expectedProposal: preview.proposal }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it.each(["round_robin", "balanced_by_track"] as const)(
    "excludes recusals for %s and produces a deterministic preview",
    async (strategy) => {
      const { event, organizer, judgeA, judgeB, projectAId, projectBId } = await setupJudging();
      await createJudgeRecusal(organizer, event.id, {
        judgeId: judgeA.userId,
        projectId: projectAId,
        reason: "Prior collaboration",
      });
      const input = {
        judgeIds: [judgeA.userId, judgeB.userId],
        reviewsPerProject: 1,
        strategy,
      };
      const first = await generateAssignmentProposal(organizer, event.id, input);
      const second = await generateAssignmentProposal(organizer, event.id, input);
      expect(first).toEqual(second);
      expect(first.proposal).not.toContainEqual({ judgeId: judgeA.userId, projectId: projectAId });
      expect(first.proposal).toHaveLength(2);
      expect(first.coverage).toMatchObject({
        projectCount: 2,
        requiredReviews: 2,
        coveredReviews: 2,
        completeProjects: 2,
        underCovered: [],
      });
      expect(first.proposal.map((item) => item.projectId).sort()).toEqual([projectAId, projectBId].sort());
    },
  );

  it.each(["round_robin", "balanced_by_track"] as const)(
    "respects judge track scopes in %s proposals",
    async (strategy) => {
      const { event, organizer, judgeA, judgeB, projectAId } = await setupJudging();
      const [projectTrack] = await db
        .insert(schema.eventTracks)
        .values({ eventId: event.id, name: "Project track" })
        .returning();
      const [otherTrack] = await db
        .insert(schema.eventTracks)
        .values({ eventId: event.id, name: "Other track" })
        .returning();
      const [project] = await db
        .select({ currentRevisionId: schema.projects.currentRevisionId })
        .from(schema.projects)
        .where(eq(schema.projects.id, projectAId));
      await db
        .update(schema.projectRevisions)
        .set({ trackId: projectTrack.id })
        .where(eq(schema.projectRevisions.id, project.currentRevisionId!));
      await db.insert(schema.judgeTrackScopes).values([
        { eventId: event.id, judgeId: judgeA.userId, trackId: otherTrack.id },
        { eventId: event.id, judgeId: judgeB.userId, trackId: otherTrack.id },
      ]);

      const result = await generateAssignmentProposal(organizer, event.id, {
        judgeIds: [judgeA.userId, judgeB.userId],
        trackIds: [projectTrack.id],
        reviewsPerProject: 1,
        strategy,
      });
      expect(result.proposal).toEqual([]);
      expect(result.coverage.underCovered).toMatchObject([
        { projectId: projectAId, assignedReviews: 0, requiredReviews: 1 },
      ]);
    },
  );

  it("commits the proposal atomically with audit records", async () => {
    const { event, organizer, judgeA, judgeB } = await setupJudging();
    const input = {
      judgeIds: [judgeA.userId, judgeB.userId],
      reviewsPerProject: 1,
      strategy: "balanced_by_track",
    } as const;
    const preview = await generateAssignmentProposal(organizer, event.id, input);
    const result = await commitAssignmentProposal(organizer, event.id, {
      ...input,
      expectedProposal: preview.proposal,
    });
    const assignments = await db
      .select()
      .from(schema.judgeAssignments)
      .where(eq(schema.judgeAssignments.eventId, event.id));
    expect(assignments).toHaveLength(result.proposal.length);
    expect(assignments.map(({ judgeId, projectId }) => ({ judgeId, projectId }))).toEqual(result.proposal);
    const audit = await db
      .select({ action: schema.auditEvents.action })
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.filter((row) => row.action === "judge.assign")).toHaveLength(result.proposal.length);
  });

  it("rejects committing a proposal that differs from the reviewed preview", async () => {
    const { event, organizer, judgeA, judgeB } = await setupJudging();
    await expect(
      commitAssignmentProposal(organizer, event.id, {
        judgeIds: [judgeA.userId, judgeB.userId],
        reviewsPerProject: 1,
        strategy: "balanced_by_track",
        expectedProposal: [],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const assignments = await db
      .select()
      .from(schema.judgeAssignments)
      .where(eq(schema.judgeAssignments.eventId, event.id));
    expect(assignments).toHaveLength(0);
  });

  it("requires a reviewed proposal and rejects stale track and capacity previews", async () => {
    const { event, organizer, judgeA, judgeB, projectAId } = await setupJudging();
    const [trackA] = await db
      .insert(schema.eventTracks)
      .values({ eventId: event.id, name: "Selected" })
      .returning();
    const [trackB] = await db
      .insert(schema.eventTracks)
      .values({ eventId: event.id, name: "Changed" })
      .returning();
    const [project] = await db
      .select({ currentRevisionId: schema.projects.currentRevisionId })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectAId));
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackA.id })
      .where(eq(schema.projectRevisions.id, project.currentRevisionId!));
    const input = {
      judgeIds: [judgeA.userId, judgeB.userId],
      trackIds: [trackA.id],
      reviewsPerProject: 1,
      strategy: "round_robin" as const,
    };
    const preview = await generateAssignmentProposal(organizer, event.id, input);
    await expect(
      commitAssignmentProposal(organizer, event.id, input),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackB.id })
      .where(eq(schema.projectRevisions.id, project.currentRevisionId!));
    await expect(
      commitAssignmentProposal(organizer, event.id, {
        ...input,
        expectedProposal: preview.proposal,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await db
      .update(schema.projectRevisions)
      .set({ trackId: trackA.id })
      .where(eq(schema.projectRevisions.id, project.currentRevisionId!));
    const refreshedPreview = await generateAssignmentProposal(organizer, event.id, input);
    await assignJudge(organizer, event.id, {
      judgeId: judgeB.userId,
      projectId: projectAId,
    });
    await expect(
      commitAssignmentProposal(organizer, event.id, {
        ...input,
        expectedProposal: refreshedPreview.proposal,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
