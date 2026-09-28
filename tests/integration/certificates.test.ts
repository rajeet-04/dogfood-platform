import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import {
  activateRubric,
  addCriterion,
  assignJudge,
  createRubric,
  startEvaluation,
  submitEvaluation,
} from "@dogfood/judging";
import {
  generateRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

import { resetDb } from "../fixtures/db";

import {
  getCertificate,
  issueCertificates,
  listCertificates,
  revokeCertificates,
} from "../../packages/certificates/src/service";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

const rankingConfig = {
  normalizationStrategy: "z-score" as const,
  minimumBatchSize: 2,
  tieBreakers: ["secondary-score", "project-id"] as const,
};

let counter = 0;

type Scenario = {
  organizer: Actor;
  participantA: Actor;
  participantB: Actor;
  participantC: Actor;
  judgeA: Actor;
  judgeB: Actor;
  event: { id: string };
  projectAId: string;
  projectBId: string;
  projectCId: string;
  winnerMemberUserId: string;
};

async function candidateUser(tag: string, email: string) {
  return registerUser({
    email,
    password: "pass",
    displayName: tag,
  });
}

async function scoredScenario(): Promise<Scenario> {
  counter += 1;
  const tag = `cert${counter}`;

  const organizer = await candidateUser(
    "Org",
    `org@${tag}.test`,
  );
  const participantA = await candidateUser(
    "Participant A",
    `a@${tag}.test`,
  );
  const participantB = await candidateUser(
    "Participant B",
    `b@${tag}.test`,
  );
  const participantC = await candidateUser(
    "Participant C",
    `c@${tag}.test`,
  );
  const extraMember = await candidateUser(
    "Team A Member",
    `am@${tag}.test`,
  );
  const judgeA = await candidateUser("Judge A", `ja@${tag}.test`);
  const judgeB = await candidateUser("Judge B", `jb@${tag}.test`);

  const event = await createEvent(actorFor(organizer.id), {
    slug: `cert-event-${counter}`,
    name: `Certificate Event ${counter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  for (const [user, role] of [
    [participantA, "PARTICIPANT"],
    [participantB, "PARTICIPANT"],
    [participantC, "PARTICIPANT"],
    [extraMember, "PARTICIPANT"],
    [judgeA, "JUDGE"],
    [judgeB, "JUDGE"],
  ] as const) {
    await grantEventMembership(actorFor(organizer.id), event.id, user.id, role);
  }

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");

  // Rosters lock when submissions open, so teams form during registration and
  // projects are only created once the window is open.
  const teamA = await createTeam(actorFor(participantA.id), event.id, {
    name: "Team A",
  });
  const teamB = await createTeam(actorFor(participantB.id), event.id, {
    name: "Team B",
  });
  const teamC = await createTeam(actorFor(participantC.id), event.id, {
    name: "Team C",
  });

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  async function makeProject(actor: Actor, teamId: string, name: string) {
    const project = await createProject(actor, event.id, {
      teamId,
      title: `Project ${name}`,
      description: `project ${name}`,
    });
    await submitProject(actor, event.id, project.id);
    return { projectId: project.id, teamId };
  }

  const { projectId: projectAId, teamId: teamAId } = await makeProject(
    actorFor(participantA.id),
    teamA.id,
    "A",
  );
  const { projectId: projectBId } = await makeProject(
    actorFor(participantB.id),
    teamB.id,
    "B",
  );
  const { projectId: projectCId } = await makeProject(
    actorFor(participantC.id),
    teamC.id,
    "C",
  );

  await db.insert(schema.teamMembers).values({
    eventId: event.id,
    teamId: teamAId,
    userId: extraMember.id,
    isOwner: false,
  });

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(actorFor(organizer.id), event.id, "JUDGING");

  const rubric = await createRubric(actorFor(organizer.id), event.id, {
    name: "Rubric",
  });
  await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Novelty",
    weight: 100,
    minScore: 0,
    maxScore: 10,
  });
  await activateRubric(actorFor(organizer.id), event.id, rubric.id);

  async function score(judge: Actor, projectId: string, value: number) {
    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judge.userId,
      projectId,
    });
    const criteria = (
      await startEvaluation(judge, event.id, assignment.id)
    ).criteria;
    const novelty = criteria.find((c) => c.name === "Novelty")!.criterionId;
    await submitEvaluation(judge, event.id, assignment.id, {
      scores: [{ criterionId: novelty, score: value }],
    });
  }

  await score(actorFor(judgeA.id), projectAId, 9);
  await score(actorFor(judgeA.id), projectBId, 4);
  await score(actorFor(judgeB.id), projectAId, 8);
  await score(actorFor(judgeB.id), projectBId, 5);

  return {
    organizer: actorFor(organizer.id),
    participantA: actorFor(participantA.id),
    participantB: actorFor(participantB.id),
    participantC: actorFor(participantC.id),
    judgeA: actorFor(judgeA.id),
    judgeB: actorFor(judgeB.id),
    event: { id: event.id },
    projectAId,
    projectBId,
    projectCId,
    winnerMemberUserId: participantA.id,
  };
}

async function resultsReady(s: Scenario): Promise<void> {
  const snapshot = await generateRankingSnapshot(
    s.organizer,
    s.event.id,
    rankingConfig,
  );
  await publishRankingSnapshot(s.organizer, s.event.id, snapshot.id);
}

describe("certificates", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("issues participation and winner certificates against published results", async () => {
    const s = await scoredScenario();
    await resultsReady(s);

    const result = await issueCertificates(s.organizer, s.event.id);
    expect(result.issued).toBe(4);
    expect(result.snapshotId).toBeTruthy();

    const rows = await db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.eventId, s.event.id));

    const byUser = new Map(rows.map((row) => [row.userId, row]));
    expect(byUser.size).toBe(4);

    const winner = byUser.get(s.winnerMemberUserId)!;
    expect(winner.tier).toBe("winner");
    expect(winner.rank).toBe(1);
    expect(winner.projectTitle).toBe("Project A");
    expect(winner.projectId).toBe(s.projectAId);

    const runnerUp = [...byUser.values()].find(
      (row) => row.projectId === s.projectBId,
    )!;
    expect(runnerUp.tier).toBe("runner_up");
    expect(runnerUp.rank).toBe(2);

    const participation = [...byUser.values()].find(
      (row) => row.projectId === s.projectCId,
    )!;
    expect(participation.tier).toBe("participation");
    expect(participation.rank).toBeNull();

    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "certificate.issue"));
    expect(audit).toHaveLength(1);
    expect(audit[0].resourceType).toBe("certificate");
    expect(audit[0].metadata).toMatchObject({ issued: 4 });
  });

  it("reissuing replaces certificates instead of duplicating", async () => {
    const s = await scoredScenario();
    await resultsReady(s);

    await issueCertificates(s.organizer, s.event.id);
    await issueCertificates(s.organizer, s.event.id);

    const rows = await db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.eventId, s.event.id));
    expect(rows).toHaveLength(4);
  });

  it("exposes a public certificate detail view", async () => {
    const s = await scoredScenario();
    await resultsReady(s);
    await issueCertificates(s.organizer, s.event.id);

    const rows = await db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.eventId, s.event.id));

    const detail = await getCertificate(rows[0].id);
    expect(detail.eventName).toBe(`Certificate Event ${counter}`);
    expect(detail.issuedAt).toBeInstanceOf(Date);

    await expect(getCertificate("00000000-0000-0000-0000-000000000000")).rejects.toMatchObject(
      { code: "NOT_FOUND" },
    );
  });

  it("refuses to issue certificates to non-organizers", async () => {
    const s = await scoredScenario();
    await resultsReady(s);

    await expect(
      issueCertificates(s.participantA, s.event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses to issue before results are ready", async () => {
    const s = await scoredScenario();

    await expect(
      issueCertificates(s.organizer, s.event.id),
    ).rejects.toMatchObject({ code: "EVENT_STATE_INVALID" });
  });

  it("revokes all certificates for an event", async () => {
    const s = await scoredScenario();
    await resultsReady(s);
    await issueCertificates(s.organizer, s.event.id);

    const result = await revokeCertificates(s.organizer, s.event.id);
    expect(result.revoked).toBe(4);

    const rows = await db
      .select()
      .from(schema.certificates)
      .where(eq(schema.certificates.eventId, s.event.id));
    expect(rows).toHaveLength(0);

    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "certificate.revoke"));
    expect(audit).toHaveLength(1);
  });

  it("lists certificates for organizers only", async () => {
    const s = await scoredScenario();
    await resultsReady(s);
    await issueCertificates(s.organizer, s.event.id);

    const items = await listCertificates(s.organizer, s.event.id);
    expect(items).toHaveLength(4);

    await expect(
      listCertificates(s.participantB, s.event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});