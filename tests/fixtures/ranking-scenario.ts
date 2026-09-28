import { registerUser } from "@dogfood/auth";
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
import type { TieBreaker } from "@dogfood/ranking";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";

export function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

export const RANKING_CONFIG = {
  normalizationStrategy: "z-score" as const,
  minimumBatchSize: 2,
  tieBreakers: ["secondary-score", "project-id"] as TieBreaker[],
};

let eventCounter = 0;

/**
 * Two participants with submitted projects, two judges who each evaluate both
 * projects, an activated rubric, and the event sitting in JUDGING.
 */
export async function rankingScenario() {
  eventCounter += 1;
  const slug = `rank-event-${eventCounter}`;
  const tag = `${eventCounter}`;

  const organizer = await registerUser({
    email: `org@rank${tag}.test`,
    password: "pass",
    displayName: "Org",
  });
  const participantA = await registerUser({
    email: `pa@rank${tag}.test`,
    password: "pass",
    displayName: "Participant A",
  });
  const participantB = await registerUser({
    email: `pb@rank${tag}.test`,
    password: "pass",
    displayName: "Participant B",
  });
  const judgeA = await registerUser({
    email: `ja@rank${tag}.test`,
    password: "pass",
    displayName: "Judge A",
  });
  const judgeB = await registerUser({
    email: `jb@rank${tag}.test`,
    password: "pass",
    displayName: "Judge B",
  });

  const event = await createEvent(actorFor(organizer.id), {
    slug,
    name: `Ranking Event ${eventCounter}`,
    timezone: "UTC",
    submissionOpensAt: new Date(Date.now() - 60_000),
    submissionClosesAt: new Date(Date.now() + 60 * 60 * 1000),
  });

  for (const [userId, role] of [
    [participantA.id, "PARTICIPANT"],
    [participantB.id, "PARTICIPANT"],
    [judgeA.id, "JUDGE"],
    [judgeB.id, "JUDGE"],
  ] as const) {
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      userId,
      role,
    );
  }

  // Teams must form before submissions open: rosters lock at SUBMISSIONS_OPEN.
  const teamA = await createTeam(actorFor(participantA.id), event.id, {
    name: "Team A",
  });
  const teamB = await createTeam(actorFor(participantB.id), event.id, {
    name: "Team B",
  });

  await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");
  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_OPEN");

  const projectA = await createProject(actorFor(participantA.id), event.id, {
    teamId: teamA.id,
    title: "Project A",
    description: "project a",
  });
  await submitProject(actorFor(participantA.id), event.id, projectA.id);

  const projectB = await createProject(actorFor(participantB.id), event.id, {
    teamId: teamB.id,
    title: "Project B",
    description: "project b",
  });
  await submitProject(actorFor(participantB.id), event.id, projectB.id);

  await transitionEvent(actorFor(organizer.id), event.id, "SUBMISSIONS_CLOSED");
  await transitionEvent(actorFor(organizer.id), event.id, "JUDGING");

  const rubric = await createRubric(actorFor(organizer.id), event.id, {
    name: "Main Rubric",
  });
  await addCriterion(actorFor(organizer.id), rubric.id, {
    name: "Novelty",
    weight: 100,
    minScore: 0,
    maxScore: 10,
  });
  await activateRubric(actorFor(organizer.id), event.id, rubric.id);

  const assignments: Record<string, string> = {};
  for (const [judge, project] of [
    [judgeA.id, projectA.id],
    [judgeA.id, projectB.id],
    [judgeB.id, projectA.id],
    [judgeB.id, projectB.id],
  ] as const) {
    const assignment = await assignJudge(actorFor(organizer.id), event.id, {
      judgeId: judge,
      projectId: project,
    });
    assignments[`${judge}-${project}`] = assignment.id;
  }

  return {
    event,
    organizer: actorFor(organizer.id),
    participantA: actorFor(participantA.id),
    participantB: actorFor(participantB.id),
    judgeA: actorFor(judgeA.id),
    judgeB: actorFor(judgeB.id),
    projectAId: projectA.id,
    projectBId: projectB.id,
    assignments,
  };
}

export async function noveltyCriterionId(
  actor: Actor,
  eventId: string,
  assignmentId: string,
): Promise<string> {
  const criteria = (await startEvaluation(actor, eventId, assignmentId))
    .criteria;
  return criteria.find((c) => c.name === "Novelty")!.criterionId;
}

export async function submitBoth(
  actor: Actor,
  eventId: string,
  scores: { projectA: number; projectB: number },
  assignments: Record<string, string>,
  judgeId: string,
  projectAId: string,
  projectBId: string,
): Promise<void> {
  for (const [projectId, value] of [
    [projectAId, scores.projectA],
    [projectBId, scores.projectB],
  ] as const) {
    const assignmentId = assignments[`${judgeId}-${projectId}`];
    const novelty = await noveltyCriterionId(actor, eventId, assignmentId);
    await submitEvaluation(actor, eventId, assignmentId, {
      scores: [{ criterionId: novelty, score: value }],
    });
  }
}

/** Submits both judges' evaluations with project A clearly ahead. */
export async function scoreBothJudges(scenario: {
  event: { id: string };
  judgeA: Actor;
  judgeB: Actor;
  projectAId: string;
  projectBId: string;
  assignments: Record<string, string>;
}): Promise<void> {
  await submitBoth(
    scenario.judgeA,
    scenario.event.id,
    { projectA: 9, projectB: 4 },
    scenario.assignments,
    scenario.judgeA.userId,
    scenario.projectAId,
    scenario.projectBId,
  );
  await submitBoth(
    scenario.judgeB,
    scenario.event.id,
    { projectA: 8, projectB: 5 },
    scenario.assignments,
    scenario.judgeB.userId,
    scenario.projectAId,
    scenario.projectBId,
  );
}
