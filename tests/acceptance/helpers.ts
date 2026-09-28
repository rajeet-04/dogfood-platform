import { expect, type Page } from "@playwright/test";
import {
  registerUser,
} from "@dogfood/auth";
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
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";
import { db, eq, schema } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

export const PASSWORD = "password123";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

export type SeedUser = {
  userId: string;
  actor: Actor;
  email: string;
  displayName: string;
};

export async function seedUser(
  email: string,
  displayName = "Seed User",
): Promise<SeedUser> {
  const user = await registerUser({
    email,
    password: PASSWORD,
    displayName,
  });
  return {
    userId: user.id,
    actor: { userId: user.id, isPlatformAdmin: false },
    email: user.email,
    displayName,
  };
}

export async function getUserIdByEmail(email: string): Promise<string> {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error(`No user with email ${email}`);
  return row.id;
}

export async function seedEvent(organizer: Actor, name: string, slug: string) {
  return createEvent(organizer, { name, slug, timezone: "UTC" });
}

export async function advanceEvent(
  actor: Actor,
  eventId: string,
  states: Array<"REGISTRATION" | "SUBMISSIONS_OPEN" | "SUBMISSIONS_CLOSED" | "JUDGING" | "RESULTS_READY" | "PUBLISHED" | "ARCHIVED">,
): Promise<void> {
  for (const state of states) {
    await transitionEvent(actor, eventId, state);
  }
}

export type RubricSeedCriterion = {
  name: string;
  weight: number;
  minScore: number;
  maxScore: number;
};

export async function seedRubric(
  organizer: Actor,
  eventId: string,
  criteria: RubricSeedCriterion[],
): Promise<string> {
  const rubric = await createRubric(organizer, eventId, { name: "Main rubric" });
  for (const criterion of criteria) {
    await addCriterion(organizer, rubric.id, criterion);
  }
  await activateRubric(organizer, eventId, rubric.id);
  return rubric.id;
}

/**
 * Creates a participant team while registration is still open. Rosters lock
 * when submissions open, so the team has to exist before that transition.
 */
export async function seedParticipantTeam(
  organizer: Actor,
  eventId: string,
  participant: SeedUser,
  name: string,
): Promise<{ teamId: string }> {
  await grantEventMembership(organizer, eventId, participant.userId, "PARTICIPANT");
  const team = await createTeam(participant.actor, eventId, { name });
  return { teamId: team.id };
}

export async function seedParticipantProject(
  organizer: Actor,
  eventId: string,
  participant: SeedUser,
  title: string,
  existingTeamId?: string,
): Promise<{ teamId: string; projectId: string }> {
  await grantEventMembership(organizer, eventId, participant.userId, "PARTICIPANT");
  const teamId =
    existingTeamId ??
    (
      await createTeam(participant.actor, eventId, {
        name: `${title} Team`,
      })
    ).id;
  const project = await createProject(participant.actor, eventId, {
    teamId,
    title,
    description: `${title} — a self-hosted hackathon project.`,
    techTags: ["react", "typescript"],
  });
  await submitProject(participant.actor, eventId, project.id);
  return { teamId, projectId: project.id };
}

export async function getAssignments(
  eventId: string,
): Promise<Array<{ id: string; judgeId: string; projectId: string }>> {
  return db
    .select({
      id: schema.judgeAssignments.id,
      judgeId: schema.judgeAssignments.judgeId,
      projectId: schema.judgeAssignments.projectId,
    })
    .from(schema.judgeAssignments)
    .where(eq(schema.judgeAssignments.eventId, eventId));
}

export async function getCriterionIds(rubricId: string): Promise<string[]> {
  const rows = await db
    .select({ id: schema.rubricCriteria.id })
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubricId))
    .orderBy(schema.rubricCriteria.sortOrder);
  return rows.map((row) => row.id);
}

export async function seedJudgeEvaluation(
  _organizer: Actor,
  eventId: string,
  rubricId: string,
  judge: SeedUser,
  assignmentId: string,
  scores: number[],
): Promise<void> {
  const criterionIds = await getCriterionIds(rubricId);
  await startEvaluation(judge.actor, eventId, assignmentId);
  await submitEvaluation(judge.actor, eventId, assignmentId, {
    scores: criterionIds.map((criterionId, index) => ({
      criterionId,
      score: scores[index] ?? 5,
    })),
  });
}

export async function registerViaUi(
  page: Page,
  email: string,
  displayName: string,
): Promise<void> {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Register" }).click();
  await page.waitForURL("**/events");
}

export async function loginViaUi(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/events");
  await waitForHydration(page);
}

export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

export async function expectNoSelector(
  page: Page,
  selector: string,
): Promise<void> {
  await expect(page.locator(selector)).toHaveCount(0);
}

export { resetDb };
export { expect } from "@playwright/test";
export { assignJudge } from "@dogfood/judging";