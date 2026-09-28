import { expect, test } from "@playwright/test";

import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";

import { loginViaUi, seedUser, uniqueEmail } from "./helpers";

test("participant creates a team, shares the code, and a teammate joins and sees the leader's project", async ({
  browser,
}) => {
  const organizer = await seedUser(uniqueEmail("org-team"), "Org Team");
  const leader = await seedUser(uniqueEmail("lead-team"), "Lead Team");
  const teammate = await seedUser(uniqueEmail("mate-team"), "Mate Team");

  const event = await createEvent(organizer.actor, {
    slug: `team-${Date.now()}`,
    name: "Team Codes",
    timezone: "UTC",
  });
  await transitionEvent(organizer.actor, event.id, "REGISTRATION");
  await grantEventMembership(organizer.actor, event.id, leader.userId, "PARTICIPANT");
  await grantEventMembership(
    organizer.actor,
    event.id,
    teammate.userId,
    "PARTICIPANT",
  );

  const leaderContext = await browser.newContext();
  const leaderPage = await leaderContext.newPage();
  await loginViaUi(leaderPage, leader.email);
  await leaderPage.goto(`/events/${event.id}/participant`);

  await leaderPage.getByLabel("Team name").fill("Rocket");
  await leaderPage.getByRole("button", { name: "Create team" }).click();
  await expect(leaderPage.getByText("Team name:")).toBeVisible({
    timeout: 15_000,
  });
  await expect(leaderPage.getByText("Leader").first()).toBeVisible();
  // The roster lists the leader, and only the leader, as owner.
  await expect(
    leaderPage.getByTestId("team-member").filter({ hasText: "Leader" }),
  ).toHaveCount(1);

  await leaderPage.getByRole("button", { name: "Create invite" }).click();
  const inviteSuccess = leaderPage.getByTestId("form-success");
  await expect(inviteSuccess).toBeVisible({ timeout: 15_000 });
  const inviteText = (await inviteSuccess.innerText()).trim();
  const codeMatch = inviteText.match(/([A-Za-z0-9]{4,16})$/);
  expect(codeMatch, `no invite code found in "${inviteText}"`).not.toBeNull();
  const code = codeMatch![1];
  expect(code.length).toBeLessThanOrEqual(16);

  // Rosters lock when submissions open, so the teammate redeems the invite
  // while registration is still open.
  const teammateContext = await browser.newContext();
  const teammatePage = await teammateContext.newPage();
  await loginViaUi(teammatePage, teammate.email);
  await teammatePage.goto(`/events/${event.id}/participant`);

  await expect(
    teammatePage.getByRole("button", { name: "Join team" }),
  ).toBeVisible({ timeout: 15_000 });
  await teammatePage.getByLabel("Invite code").fill(code);
  await teammatePage.getByRole("button", { name: "Join team" }).click();
  await expect(teammatePage.getByText("Team name:")).toBeVisible({
    timeout: 15_000,
  });
  // The teammate joined but is not an owner, while the leader still is.
  await expect(
    teammatePage.getByTestId("team-member").filter({ hasText: "Leader" }),
  ).toHaveCount(1);
  await expect(
    teammatePage.getByTestId("team-member").filter({ hasText: teammate.displayName }),
  ).not.toContainText("Leader");

  await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_OPEN");

  await leaderPage.getByLabel("Title").fill("Shared Project");
  await leaderPage
    .getByLabel("Description")
    .fill("Submitted by the team leader on behalf of the whole team.");
  await leaderPage.getByRole("button", { name: "Create project" }).click();
  await expect(
    leaderPage.getByRole("heading", { name: "Shared Project" }),
  ).toBeVisible({
    timeout: 15_000,
  });

  await leaderPage.getByRole("button", { name: "Submit saved revision" }).click();
  await expect(leaderPage.getByTestId("project-state")).toHaveText("SUBMITTED", {
    timeout: 15_000,
  });

  await teammatePage.reload();
  await expect(
    teammatePage.getByRole("heading", { name: "Shared Project" }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(teammatePage.getByTestId("project-state")).toHaveText(
    "SUBMITTED",
  );

  await leaderContext.close();
  await teammateContext.close();
});
