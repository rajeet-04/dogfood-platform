import { test } from "@playwright/test";
import type { Locator } from "@playwright/test";

import {
  expect,
  PASSWORD,
  uniqueEmail,
} from "../tests/acceptance/helpers";

async function clickCentered(locator: Locator): Promise<void> {
  await locator.evaluate((element) => element.scrollIntoView({ block: "center" }));
  await locator.click();
}

test("five-minute event lifecycle: create, submit, score, publish", async ({
  browser,
  page: organizerPage,
}) => {
  test.setTimeout(600_000);
  const organizerEmail = uniqueEmail("demo-organizer");
  const participantEmail = uniqueEmail("demo-participant");
  const judgeEmail = uniqueEmail("demo-judge");
  const unassignedJudgeEmail = uniqueEmail("demo-unassigned-judge");

  // The organizer account and event are created through the public UI.
  await organizerPage.goto("/register");
  await organizerPage.getByLabel("Email").fill(organizerEmail);
  await organizerPage.getByLabel("Display name").fill("Morgan Organizer");
  await organizerPage.getByLabel("Password").fill(PASSWORD);
  await organizerPage.getByRole("button", { name: "Register" }).click();
  await organizerPage.waitForURL("**/events");
  await organizerPage.goto("/events/new");
  await organizerPage.getByLabel("Slug").fill(`demo-${Date.now()}`);
  await organizerPage.getByLabel("Name").fill("Dogfood Five Minute Demo");
  await organizerPage
    .getByLabel("Description (optional)")
    .fill("A complete local hackathon lifecycle, from registration to published results.");
  await organizerPage.getByRole("button", { name: "Create event" }).click();
  await organizerPage.waitForURL(/\/events\/[0-9a-f-]+\/organizer$/);
  const eventId = organizerPage.url().match(/\/events\/([0-9a-f-]+)\/organizer$/)?.[1];
  if (!eventId) throw new Error("Could not read the event ID from the organizer URL");
  await expect(organizerPage.getByRole("heading", { name: "Organizer dashboard" })).toBeVisible();
  await organizerPage.getByRole("button", { name: "Advance to Registration" }).click();
  await expect(organizerPage.getByTestId("event-state")).toHaveText("Registration");
  await organizerPage.waitForTimeout(49_000);

  // A participant creates an account, joins this event, and forms a team.
  const participantContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const participantPage = await participantContext.newPage();
  await participantPage.goto("/register");
  await participantPage.getByLabel("Email").fill(participantEmail);
  await participantPage.getByLabel("Display name").fill("Avery Participant");
  await participantPage.getByLabel("Password").fill(PASSWORD);
  await participantPage.getByRole("button", { name: "Register" }).click();
  await participantPage.waitForURL("**/events");
  await participantPage.goto(`/events/${eventId}`);
  await participantPage.getByRole("button", { name: "Join as participant" }).click();
  await expect(participantPage.getByText("You are part of this event")).toBeVisible();
  await participantPage.goto(`/events/${eventId}/participant`);
  await participantPage.getByLabel("Team name").fill("Team Daybreak");
  await participantPage.getByRole("button", { name: "Create team" }).click();
  await expect(participantPage.getByText("Team Daybreak")).toBeVisible();
  await participantPage.waitForTimeout(49_000);

  // Register a judge, then let the organizer advance the event and grant the role.
  const judgeContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const judgePage = await judgeContext.newPage();
  await judgePage.goto("/register");
  await judgePage.getByLabel("Email").fill(judgeEmail);
  await judgePage.getByLabel("Display name").fill("Jordan Judge");
  await judgePage.getByLabel("Password").fill(PASSWORD);
  await judgePage.getByRole("button", { name: "Register" }).click();
  await judgePage.waitForURL("**/events");

  // This second judge is a real event member, but will receive no assignment.
  const unassignedJudgeContext = await browser.newContext({ viewport: { width: 1365, height: 900 } });
  const unassignedJudgePage = await unassignedJudgeContext.newPage();
  await unassignedJudgePage.goto("/register");
  await unassignedJudgePage.getByLabel("Email").fill(unassignedJudgeEmail);
  await unassignedJudgePage.getByLabel("Display name").fill("Casey Unassigned Judge");
  await unassignedJudgePage.getByLabel("Password").fill(PASSWORD);
  await unassignedJudgePage.getByRole("button", { name: "Register" }).click();
  await unassignedJudgePage.waitForURL("**/events");

  await organizerPage.getByRole("button", { name: "Advance to Submissions open" }).click();
  await expect(organizerPage.getByTestId("event-state")).toHaveText("Submissions open");
  await participantPage.reload();
  await participantPage.getByLabel("Title").fill("Harborlight");
  await participantPage.getByLabel("Tagline").fill("A community map for safer coastlines.");
  await participantPage.getByLabel("Description").fill("Harborlight helps neighbors report coastal hazards and share verified local updates.");
  await participantPage.getByLabel("Repository URL").fill("https://github.com/example/harborlight");
  await participantPage.getByLabel("Tech tags (comma separated)").fill("typescript, maps");
  await participantPage.getByRole("button", { name: "Create project" }).click();
  await expect(participantPage.getByRole("heading", { name: "Harborlight" })).toBeVisible();
  await participantPage.getByRole("button", { name: "Submit saved revision" }).click();
  await expect(participantPage.getByTestId("project-state")).toHaveText("SUBMITTED");
  await participantPage.waitForTimeout(49_000);

  await organizerPage.getByLabel("Email", { exact: true }).fill(judgeEmail);
  await organizerPage.getByLabel("Role for new member").selectOption("JUDGE");
  await organizerPage.getByRole("button", { name: "Add member" }).click();
  await expect(organizerPage.getByText(judgeEmail, { exact: true })).toBeVisible();
  await organizerPage.getByLabel("Email", { exact: true }).fill(unassignedJudgeEmail);
  await organizerPage.getByLabel("Role for new member").selectOption("JUDGE");
  await organizerPage.getByRole("button", { name: "Add member" }).click();
  await expect(organizerPage.getByText(unassignedJudgeEmail, { exact: true })).toBeVisible();
  await clickCentered(organizerPage.getByRole("button", { name: "Advance to Submissions closed" }));
  await clickCentered(organizerPage.getByRole("button", { name: "Advance to Judging" }));
  await expect(organizerPage.getByTestId("event-state")).toHaveText("Judging");
  await organizerPage.reload();

  // Configure a rubric and assign this judge to the participant's submitted project.
  await organizerPage.getByLabel("Rubric name").fill("Community impact");
  await organizerPage.getByRole("button", { name: "Create rubric" }).click();
  await expect(organizerPage.getByText(/Community impact v/)).toBeVisible();
  await organizerPage.getByLabel("Criterion name").fill("Local value");
  await organizerPage.getByLabel("Weight").fill("100");
  await organizerPage.getByLabel("Min").fill("0");
  await organizerPage.getByLabel("Max", { exact: true }).fill("10");
  await organizerPage.getByRole("button", { name: "Add criterion" }).click();
  await expect(organizerPage.getByText(/Local value — weight 100/)).toBeVisible();
  await organizerPage.getByRole("button", { name: "Activate" }).click();
  await expect(organizerPage.getByText("Active", { exact: true })).toBeVisible();
  const assignedJudgeSelect = organizerPage.locator('select[name="judgeId"]');
  const assignedJudgeOption = await assignedJudgeSelect.locator("option").evaluateAll(
    (options, email) => options.find((option) => option.textContent?.includes(email))?.value,
    judgeEmail,
  );
  if (!assignedJudgeOption) throw new Error("Could not find the assigned judge in the organizer roster");
  await assignedJudgeSelect.selectOption(assignedJudgeOption);
  const projectSelect = organizerPage.locator('select[name="projectId"]');
  await expect(projectSelect.locator("option")).toHaveCount(1);
  await projectSelect.selectOption({ index: 0 });
  await organizerPage.getByRole("button", { name: "Assign judge" }).click();
  await expect(organizerPage.getByTestId("coverage-total")).toHaveText("1");
  await organizerPage.waitForTimeout(49_000);

  // The judge scores in their own browser session.
  await judgePage.goto(`/events/${eventId}/judge`);
  await expect(judgePage.getByText("Harborlight")).toBeVisible();
  await judgePage.getByRole("link", { name: "Evaluate" }).click();
  await judgePage.getByRole("button", { name: "Start evaluation" }).click();
  const assignmentsResponse = await organizerPage.evaluate(async ({ eventId }) => {
    const response = await fetch(`/api/v1/events/${eventId}/judge-assignments`);
    const body = await response.json();
    return { status: response.status, body };
  }, { eventId });
  expect(assignmentsResponse.status).toBe(200);
  const assignedJudgeId = assignedJudgeOption;
  const assignmentId = (assignmentsResponse.body as {
    assignments: Array<{ id: string; judgeId: string }>;
  }).assignments.find((assignment) => assignment.judgeId === assignedJudgeId)?.id;
  if (!assignmentId) throw new Error("Could not find the assigned judge's assignment through the API");

  // Probe the raw JSON endpoint from each signed-in judge session. The assigned
  // judge may read the evaluation; another JUDGE member may not.
  const evaluationPath = `/api/v1/events/${eventId}/evaluations/${assignmentId}`;
  const assignedJudgeApi = await judgePage.evaluate(async (path) => {
    const response = await fetch(path);
    return { status: response.status, body: await response.json() };
  }, evaluationPath);
  const unassignedJudgeApi = await unassignedJudgePage.evaluate(async (path) => {
    const response = await fetch(path);
    return { status: response.status, body: await response.json() };
  }, evaluationPath);
  expect(assignedJudgeApi.status, "assigned judge can read their evaluation over the raw API").toBe(200);
  expect(unassignedJudgeApi.status, "unassigned judge is denied by the raw API").toBe(403);
  await expect(judgePage.getByRole("heading", { name: "Harborlight" })).toBeVisible();
  await judgePage.locator("input[data-criterion-id]").fill("9");
  await judgePage.getByLabel("Overall comment").fill("Clear community need and a focused solution.");
  await judgePage.getByRole("button", { name: "Submit evaluation" }).click();
  await expect(judgePage.getByTestId("assignment-status")).toHaveText("Submitted");
  await judgePage.waitForTimeout(49_000);

  // Organizer locks judging, generates the ranking, then publishes it publicly.
  await organizerPage.reload();
  await expect(organizerPage.getByTestId("coverage-completed")).toHaveText("1 / 1");
  await clickCentered(organizerPage.getByRole("button", { name: "Lock submitted evaluations" }));
  await expect(organizerPage.getByTestId("all-locked-note")).toBeVisible();
  await clickCentered(organizerPage.getByRole("button", { name: "Generate ranking snapshot" }));
  await expect(organizerPage.getByText("Ranking snapshot")).toBeVisible();
  await expect(organizerPage.getByTestId("results-row").getByText("Harborlight").first()).toBeVisible();
  await clickCentered(organizerPage.getByRole("button", { name: "Publish results" }));
  await expect(organizerPage.getByTestId("event-state")).toHaveText("Results ready");
  await clickCentered(organizerPage.getByRole("button", { name: "Advance to Published" }));
  await expect(organizerPage.getByTestId("event-state")).toHaveText("Published");
  await expect(organizerPage.getByTestId("results-row")).toHaveCount(1);
  await organizerPage.waitForTimeout(49_000);

  await participantContext.close();
  await judgeContext.close();
  await unassignedJudgeContext.close();
});
