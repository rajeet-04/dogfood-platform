import { test } from "@playwright/test";
import { grantEventMembership } from "@dogfood/events";
import { lockEvaluation } from "@dogfood/judging";
import {
  generateRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";

import {
  advanceEvent,
  assignJudge,
  expect,
  loginViaUi,
  resetDb,
  seedEvent,
  seedJudgeEvaluation,
  seedParticipantProject,
  seedParticipantTeam,
  seedRubric,
  seedUser,
  uniqueEmail,
} from "./helpers";

const RANKING_CONFIG = {
  normalizationStrategy: "z-score" as const,
  minimumBatchSize: 1,
  tieBreakers: ["secondary-score", "project-id"] as const,
};

test.describe.configure({ mode: "serial" });

async function judgedEvent() {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("org"), "Olga");
  const event = await seedEvent(organizer.actor, "Score Visibility", "score-vis");
  await advanceEvent(organizer.actor, event.id, ["REGISTRATION"]);

  const participant = await seedUser(uniqueEmail("pat"), "Pat");
  // Rosters lock when submissions open, so the team is seeded during
  // registration and only the project is submitted afterwards.
  const { teamId } = await seedParticipantTeam(
    organizer.actor,
    event.id,
    participant,
    "Deep Learning Dash Team",
  );
  await advanceEvent(organizer.actor, event.id, ["SUBMISSIONS_OPEN"]);
  const { projectId } = await seedParticipantProject(
    organizer.actor,
    event.id,
    participant,
    "Deep Learning Dash",
    teamId,
  );

  const judge = await seedUser(uniqueEmail("judge"), "Jana");
  await grantEventMembership(organizer.actor, event.id, judge.userId, "JUDGE");

  await advanceEvent(organizer.actor, event.id, [
    "SUBMISSIONS_CLOSED",
    "JUDGING",
  ]);

  const rubricId = await seedRubric(organizer.actor, event.id, [
    { name: "Impact", weight: 60, minScore: 0, maxScore: 10 },
    { name: "Polish", weight: 40, minScore: 0, maxScore: 10 },
  ]);

  const assignment = await assignJudge(organizer.actor, event.id, {
    judgeId: judge.userId,
    projectId,
  });
  await seedJudgeEvaluation(
    organizer.actor,
    event.id,
    rubricId,
    judge,
    assignment.id,
    [8, 9],
  );
  await lockEvaluation(organizer.actor, event.id, assignment.id);

  return { organizer, participant, event, projectId };
}

test("participants see their score only after results are published", async ({
  page,
}) => {
  const { participant, event, organizer, projectId } = await judgedEvent();

  const snapshot = await generateRankingSnapshot(
    organizer.actor,
    event.id,
    RANKING_CONFIG,
  );
  expect(snapshot.publishedAt).toBeNull();

  // Unpublished: the participant dashboard explains that scores are pending
  await loginViaUi(page, participant.email);
  await page.goto(`/events/${event.id}/participant`);
  await expect(page.getByText("Participant dashboard")).toBeVisible();
  await expect(page.getByTestId("results-pending")).toBeVisible();
  await expect(page.getByTestId("results-table")).toHaveCount(0);

  await publishRankingSnapshot(organizer.actor, event.id, snapshot.id);

  // Published: rank, score and the full leaderboard are visible
  await page.reload();
  await expect(page.getByTestId("results-section")).toBeVisible();
  await expect(page.getByTestId("my-rank")).toHaveText("#1");
  await expect(page.getByTestId("my-score")).not.toBeEmpty();

  const row = page.locator(`[data-project-id="${projectId}"]`);
  await expect(row.getByText("Deep Learning Dash").first()).toBeVisible();
  await expect(row.getByText("Your project")).toBeVisible();
  await expect(row.getByTestId("result-score")).not.toBeEmpty();
  await expect(row.getByText(/Impact:/)).toBeVisible();
  await expect(row.getByText(/Polish:/)).toBeVisible();
});

test("published results are public on the event page", async ({ page }) => {
  const { event, organizer } = await judgedEvent();

  await loginViaUi(page, organizer.email);
  await page.goto(`/events/${event.id}`);
  await expect(page.getByTestId("public-results")).toHaveCount(0);

  const snapshot = await generateRankingSnapshot(
    organizer.actor,
    event.id,
    RANKING_CONFIG,
  );
  await publishRankingSnapshot(organizer.actor, event.id, snapshot.id);

  await page.reload();
  const publicResults = page.getByTestId("public-results");
  await expect(publicResults).toBeVisible();
  await expect(publicResults.getByText("Deep Learning Dash").first()).toBeVisible();
  await expect(
    publicResults.locator('[data-testid="result-score"]'),
  ).not.toBeEmpty();
  await expect(publicResults.getByTestId("results-row")).toHaveCount(1);
});
