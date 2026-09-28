import { test } from "@playwright/test";

import { updateVotingConfig } from "@dogfood/voting";

import {
  advanceEvent,
  expect,
  loginViaUi,
  resetDb,
  seedEvent,
  seedParticipantProject,
  seedParticipantTeam,
  seedUser,
  uniqueEmail,
} from "./helpers";

test("a visitor signs in, comments on a visible project, and casts one community vote", async ({ page }) => {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("vote-org"), "Event organizer");
  const event = await seedEvent(organizer.actor, "Community Hack", "community-hack");
  await advanceEvent(organizer.actor, event.id, ["REGISTRATION"]);
  const participant = await seedUser(uniqueEmail("vote-participant"), "Project builder");
  const { teamId } = await seedParticipantTeam(organizer.actor, event.id, participant, "Builders");
  await advanceEvent(organizer.actor, event.id, ["SUBMISSIONS_OPEN"]);
  await seedParticipantProject(organizer.actor, event.id, participant, "Civic Map", teamId);
  await advanceEvent(organizer.actor, event.id, ["SUBMISSIONS_CLOSED", "JUDGING"]);
  await updateVotingConfig(organizer.actor, event.id, {
    opensAt: new Date(Date.now() - 60_000),
    closesAt: new Date(Date.now() + 60 * 60_000),
  });

  const voter = await seedUser(uniqueEmail("voter"), "Community voter");
  await loginViaUi(page, voter.email);
  await page.goto(`/events/${event.id}`);
  await page.getByRole("link", { name: "Community vote" }).click();
  await expect(page.getByRole("heading", { name: "Cast your vote" })).toBeVisible();
  await expect(page.getByText("Civic Map", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Comments" }).click();
  await page.getByLabel("Add a comment").fill("Clear and useful project.");
  await page.getByRole("button", { name: "Post comment" }).click();
  await expect(page.getByText("Clear and useful project.")).toBeVisible();

  await page.getByRole("radio", { name: "Vote for Civic Map" }).check();
  await page.getByRole("button", { name: "Submit vote" }).click();
  await expect(page.getByTestId("vote-success")).toContainText("Your vote is recorded.");
  await expect(page.getByRole("button", { name: "Submit vote" })).toHaveCount(0);
});

test("organizer configures the authenticated community voting window", async ({ page }) => {
  await resetDb();
  const organizer = await seedUser(uniqueEmail("vote-settings-org"), "Voting organizer");
  const event = await seedEvent(organizer.actor, "Voting settings", "voting-settings");
  let allowLoad = false;
  await page.route("**/api/v1/events/*/voting/config", async (route) => {
    if (route.request().method() === "GET" && !allowLoad) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { message: "Could not load voting settings." } }) });
      return;
    }
    await route.continue();
  });

  await loginViaUi(page, organizer.email);
  await page.goto(`/events/${event.id}/organizer`);
  const settings = page.getByRole("region", { name: "Community voting" });
  await expect(settings.getByText("Choose who can vote. Times use UTC. Leave both dates empty to disable community voting.")).toBeVisible();
  await expect(settings.getByLabel("Voting opens")).toBeDisabled();
  await expect(settings.getByRole("alert")).toHaveText("Could not load voting settings.");
  allowLoad = true;
  await settings.getByRole("button", { name: "Retry loading settings" }).click();
  await expect(settings.getByLabel("Voting opens")).toBeEnabled();
  await expect(settings.getByLabel("Voting opens")).toHaveValue("");
  await expect(settings.getByLabel("Voting closes")).toHaveValue("");
  await settings.getByLabel("Voting opens").fill("2027-03-01T10:00");
  await settings.getByLabel("Voting closes").fill("2027-03-02T10:00");
  await settings.getByLabel("Voter access").selectOption("OPEN_LINK");
  await settings.getByRole("button", { name: "Save voting settings" }).click();
  await expect(settings.getByRole("status")).toHaveText("Community voting settings saved.");
  const savedConfig = await page.evaluate(async (eventId) => {
    const response = await fetch(`/api/v1/events/${eventId}/voting/config`);
    return (await response.json()).config as { accessMode: string; opensAt: string; closesAt: string };
  }, event.id);
  expect(savedConfig.accessMode).toBe("OPEN_LINK");
  expect(savedConfig.opensAt).toBe("2027-03-01T10:00:00.000Z");
  expect(savedConfig.closesAt).toBe("2027-03-02T10:00:00.000Z");

  await page.reload();
  await expect(settings.getByLabel("Voting opens")).toHaveValue("2027-03-01T10:00");
  await expect(settings.getByLabel("Voting closes")).toHaveValue("2027-03-02T10:00");
});
