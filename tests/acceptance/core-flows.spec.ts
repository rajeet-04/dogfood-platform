import { test } from "@playwright/test";
import { grantEventMembership } from "@dogfood/events";
import { lockEvaluation } from "@dogfood/judging";
import { db, eq, schema } from "@dogfood/db";

import {
  advanceEvent,
  assignJudge,
  expect,
  getAssignments,
  getUserIdByEmail,
  loginViaUi,
  registerViaUi,
  resetDb,
  seedEvent,
  seedJudgeEvaluation,
  seedParticipantProject,
  seedRubric,
  seedUser,
  uniqueEmail,
} from "./helpers";

test.describe.configure({ mode: "serial" });

test("participant journey: team → project → revision → submit", async ({ page }) => {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("org"), "Olga");
  const event = await seedEvent(organizer.actor, "Hack Summer", "hack-summer");
  await advanceEvent(organizer.actor, event.id, [
    "REGISTRATION",
    "SUBMISSIONS_OPEN",
  ]);

  const participantEmail = uniqueEmail("pat");
  await registerViaUi(page, participantEmail, "Pat");
  const participantId = await getUserIdByEmail(participantEmail);
  await grantEventMembership(
    organizer.actor,
    event.id,
    participantId,
    "PARTICIPANT",
  );

  await page.goto(`/events/${event.id}/participant`);
  await expect(page.getByText("Participant dashboard")).toBeVisible();

  // Create team
  await page.getByLabel("Team name").fill("Team Pat");
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByText("Team Pat")).toBeVisible();

  // Create project
  await page.getByLabel("Title").fill("Pat's Hack Project");
  await page.getByLabel("Description").fill("An absolutely amazing project.");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByTestId("project-state")).toHaveText("DRAFT");
  await expect(
    page.getByRole("heading", { name: "Pat's Hack Project" }),
  ).toBeVisible();

  // Revise project (revision 2)
  await page.getByLabel("Title").fill("Pat's Hack Project v2");
  await page.getByRole("button", { name: "Save revision" }).click();
  await expect(page.getByTestId("revision-row")).toHaveCount(2);
  await expect(
    page.getByRole("heading", { name: "Pat's Hack Project v2" }),
  ).toBeVisible();

  // Submit for judging
  await page.getByRole("button", { name: "Submit for judging" }).click();
  await expect(page.getByTestId("project-state")).toHaveText("SUBMITTED");
});

test("judge journey: queue → evaluate → submit → verify lock", async ({ page }) => {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("org"), "Olga");
  const event = await seedEvent(organizer.actor, "Hack Season", "hack-season");
  await advanceEvent(organizer.actor, event.id, [
    "REGISTRATION",
    "SUBMISSIONS_OPEN",
  ]);

  const rubricId = await seedRubric(organizer.actor, event.id, [
    { name: "Impact", weight: 60, minScore: 0, maxScore: 10 },
    { name: "Polish", weight: 40, minScore: 0, maxScore: 10 },
  ]);

  const participant = await seedUser(uniqueEmail("part"), "Theo");
  const { projectId } = await seedParticipantProject(
    organizer.actor,
    event.id,
    participant,
    "Cool App",
  );

  await advanceEvent(organizer.actor, event.id, [
    "SUBMISSIONS_CLOSED",
    "JUDGING",
  ]);

  const judge = await seedUser(uniqueEmail("judge"), "Jana");
  await grantEventMembership(organizer.actor, event.id, judge.userId, "JUDGE");
  const assignment = await assignJudge(organizer.actor, event.id, {
    judgeId: judge.userId,
    projectId,
  });

  await loginViaUi(page, judge.email);
  await page.goto(`/events/${event.id}/judge`);
  await expect(page.getByText("Cool App")).toBeVisible();
  await expect(page.getByText("0 of 1 complete")).toBeVisible();

  await page.getByRole("link", { name: "Evaluate" }).click();
  await expect(page.getByText("Cool App")).toBeVisible();

  // Start the evaluation
  await page.getByRole("button", { name: "Start evaluation" }).click();
  await expect(page.locator("input[data-criterion-id]")).toHaveCount(2);

  // Score both criteria and submit
  await page.locator("input[data-criterion-id]").nth(0).fill("8");
  await page.locator("input[data-criterion-id]").nth(1).fill("9");
  await page.getByLabel("Overall comment").fill("Strong entry.");
  await page.getByRole("button", { name: "Submit evaluation" }).click();
  await expect(page.getByTestId("assignment-status")).toHaveText("Submitted");

  // Organizer locks the evaluation; the judge sees read-only state
  await lockEvaluation(organizer.actor, event.id, assignment.id);
  await page.reload();
  await expect(page.getByTestId("assignment-status")).toHaveText("Locked");
  await expect(page.getByTestId("locked-banner")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read only" }),
  ).toBeDisabled();
  for (const input of await page.locator("input[data-criterion-id]").all()) {
    await expect(input).toBeDisabled();
  }
});

test("organizer journey: rubric → assign → progress → lock → ranking → publish", async ({ page }) => {
  await resetDb();

  const organizerEmail = uniqueEmail("org");
  await registerViaUi(page, organizerEmail, "Olga");
  const organizerId = await getUserIdByEmail(organizerEmail);
  const organizer = { userId: organizerId, isPlatformAdmin: false };
  const event = await seedEvent(organizer, "Final Hack", "final-hack");

  await page.goto(`/events/${event.id}/organizer`);
  await expect(page.getByText("Organizer dashboard")).toBeVisible();

  // Advance the event through the UI
  await page.getByRole("button", { name: "Advance to Registration" }).click();
  await expect(page.getByTestId("event-state")).toHaveText("Registration");
  await page.getByRole("button", { name: "Advance to Submissions open" }).click();
  await expect(page.getByTestId("event-state")).toHaveText("Submissions open");

  // Seed a participant project and a judge while the window is open
  const participant = await seedUser(uniqueEmail("part"), "Theo");
  await seedParticipantProject(organizer, event.id, participant, "Neo App");
  const judge = await seedUser(uniqueEmail("judge"), "Jana");
  await grantEventMembership(organizer, event.id, judge.userId, "JUDGE");

  await page.getByRole("button", { name: "Advance to Submissions closed" }).click();
  await expect(page.getByTestId("event-state")).toHaveText("Submissions closed");
  await page.getByRole("button", { name: "Advance to Judging" }).click();
  await expect(page.getByTestId("event-state")).toHaveText("Judging");

  // Build a rubric through the UI
  await page.getByLabel("Rubric name").fill("Quality");
  await page.getByRole("button", { name: "Create rubric" }).click();
  await expect(page.getByText(/Quality v/)).toBeVisible();

  await page.getByLabel("Criterion name").fill("Impact");
  await page.getByLabel("Weight").fill("60");
  await page.getByLabel("Min").fill("0");
  await page.getByLabel("Max").fill("10");
  await page.getByRole("button", { name: "Add criterion" }).click();
  await expect(page.getByText(/Impact — weight 60/)).toBeVisible();

  await page.getByLabel("Criterion name").fill("Polish");
  await page.getByLabel("Weight").fill("40");
  await page.getByLabel("Min").fill("0");
  await page.getByLabel("Max").fill("10");
  await page.getByRole("button", { name: "Add criterion" }).click();
  await expect(page.getByText(/Polish — weight 40/)).toBeVisible();

  await page.getByRole("button", { name: "Activate" }).click();
  await expect(page.getByText("Active")).toBeVisible();

  // Assign the judge to the seeded project through the UI
  await page.getByLabel("Judge").selectOption({ index: 0 });
  await page.getByLabel("Project").selectOption({ index: 0 });
  await page.getByRole("button", { name: "Assign judge" }).click();
  await expect(page.getByTestId("coverage-total")).toHaveText("1");

  // Seed the evaluation for that assignment
  const [assignment] = await getAssignments(event.id);
  const [rubricRow] = await db
    .select({ id: schema.rubrics.id })
    .from(schema.rubrics)
    .where(eq(schema.rubrics.eventId, event.id))
    .limit(1);
  await seedJudgeEvaluation(
    organizer,
    event.id,
    rubricRow.id,
    judge,
    assignment.id,
    [8, 9],
  );

  // Progress is visible but raw scores are withheld during judging
  await page.reload();
  await expect(page.getByTestId("coverage-total")).toHaveText("1");
  await expect(page.getByTestId("coverage-completed")).toHaveText("1 / 1");
  await expect(page.getByTestId("scores-hidden-note")).toBeVisible();
  await expect(page.locator("input[data-criterion-id]")).toHaveCount(0);

  // Lock, rank, publish
  await page.getByRole("button", { name: "Lock submitted evaluations" }).click();
  await expect(page.getByTestId("all-locked-note")).toBeVisible();

  await page.getByRole("button", { name: "Generate ranking snapshot" }).click();
  await expect(page.getByText("Ranking snapshot")).toBeVisible();

  await page.getByRole("button", { name: "Publish results" }).click();
  await expect(page.getByTestId("event-state")).toHaveText("Results ready");
  await expect(page.getByText("Published", { exact: true })).toBeVisible();
});