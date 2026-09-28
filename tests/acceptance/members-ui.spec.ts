import { expect, test } from "@playwright/test";

import { createEvent, transitionEvent } from "@dogfood/events";

import {
  loginViaUi,
  seedUser,
  uniqueEmail,
} from "./helpers";

test("participant joins via UI and organizer manages members", async ({
  browser,
}) => {
  const organizer = await seedUser(uniqueEmail("org-ui"), "Org UI");
  const participant = await seedUser(uniqueEmail("participant-ui"), "Pat UI");
  const judge = await seedUser(uniqueEmail("judge-ui"), "Judge UI");

  const event = await createEvent(organizer.actor, {
    slug: `ui-${Date.now()}`,
    name: "UI Membership",
    timezone: "UTC",
  });
  await transitionEvent(organizer.actor, event.id, "REGISTRATION");

  const participantContext = await browser.newContext();
  const participantPage = await participantContext.newPage();
  await loginViaUi(participantPage, participant.email);

  await participantPage.goto(`/events/${event.id}`);
  const joinButton = participantPage.getByRole("button", {
    name: "Join as participant",
  });
  await expect(joinButton).toBeVisible({ timeout: 15_000 });
  await joinButton.click();
  await expect(
    participantPage.getByRole("link", { name: "Participant dashboard" }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(joinButton).toHaveCount(0);

  const organizerContext = await browser.newContext();
  const organizerPage = await organizerContext.newPage();
  await loginViaUi(organizerPage, organizer.email);

  await organizerPage.goto(`/events/${event.id}/organizer`);
  await expect(
    organizerPage.getByRole("heading", { name: "Members" }),
  ).toBeVisible({ timeout: 15_000 });

  const participantRow = organizerPage.locator(
    '[data-testid="member-row"]',
    { hasText: participant.email },
  );
  await expect(participantRow).toBeVisible();

  const organizerRow = organizerPage.locator(
    '[data-testid="member-row"]',
    { hasText: organizer.email },
  );
  await expect(organizerRow.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(
    organizerRow.getByRole("button", { name: "Update" }),
  ).toBeDisabled();

  await organizerPage.getByLabel("Email", { exact: true }).fill(judge.email);
  // Participants self-join, so the add form only offers judge and organizer
  // while the change-role form still offers participant.
  const newMemberRole = organizerPage.getByLabel("Role for new member");
  await expect(newMemberRole.locator("option")).toHaveText([
    "Judge",
    "Organizer",
  ]);
  const changeRole = participantRow.getByLabel("Role for Pat UI");
  await expect(changeRole.locator("option[value=PARTICIPANT]")).toHaveCount(1);

  await newMemberRole.selectOption("JUDGE");
  await organizerPage.getByRole("button", { name: "Add member" }).click();

  const judgeRow = organizerPage.locator(
    '[data-testid="member-row"]',
    { hasText: judge.email },
  );
  await expect(judgeRow).toBeVisible({ timeout: 15_000 });
  await expect(judgeRow.getByTestId("member-role")).toHaveText("Judge");

  await participantRow
    .getByLabel("Role for Pat UI")
    .selectOption("JUDGE");
  await participantRow.getByRole("button", { name: "Update" }).click();
  await expect(participantRow.getByTestId("member-role")).toHaveText("Judge");

  await participantRow.getByRole("button", { name: "Remove" }).click();
  await expect(participantRow).toHaveCount(0);

  await participantContext.close();
  await organizerContext.close();
});