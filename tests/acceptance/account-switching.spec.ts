import { expect, test } from "@playwright/test";

import { createEvent, transitionEvent } from "@dogfood/events";

import { loginViaUi, seedUser, uniqueEmail } from "./helpers";

// Two logins, a membership, a sign out, an account switch and a per-account
// sign out: this needs more than the default budget on a cold dev server.
test.setTimeout(90_000);

test("profile page lists memberships and a user can switch between two accounts", async ({
  browser,
}) => {
  const organizer = await seedUser(uniqueEmail("org-prof"), "Prof Org");
  const first = await seedUser(uniqueEmail("first-prof"), "First Prof");
  const second = await seedUser(uniqueEmail("second-prof"), "Second Prof");

  const event = await createEvent(organizer.actor, {
    slug: `prof-${Date.now()}`,
    name: "Profile Event",
    timezone: "UTC",
  });
  await transitionEvent(organizer.actor, event.id, "REGISTRATION");

  const context = await browser.newContext();
  const page = await context.newPage();
  await loginViaUi(page, first.email);
  await page.waitForLoadState("networkidle");

  await page.goto(`/events/${event.id}`);
  await page.getByRole("button", { name: "Join as participant" }).click();

  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.locator("main").getByText(first.email)).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: "Profile Event" }),
  ).toBeVisible();
  await expect(page.locator("main").getByText("Participant")).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/");
  await expect(
    page.locator("header").getByRole("link", { name: "Log in" }),
  ).toBeVisible();

  await loginViaUi(page, second.email);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Accounts (2)", { exact: false }),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByText("Accounts (2)").click();
  await page
    .locator('[data-testid="account-row"]', { hasText: first.email })
    .getByRole("button", { name: "Switch to" })
    .click();

  await expect(async () => {
    await page.goto("/profile");
    await expect(page.locator("main").getByText(first.email)).toBeVisible();
    await expect(
      page.locator("main").getByRole("link", { name: "Profile Event" }),
    ).toBeVisible();
  }).toPass({ timeout: 20_000 });

  await page.getByText("Accounts (2)").click();
  await page
    .locator('[data-testid="account-row"]', { hasText: first.email })
    .getByRole("button", { name: "Sign out" })
    .click();

  await expect(async () => {
    await page.goto("/profile");
    await expect(page.locator("main").getByText(second.email)).toBeVisible();
    await expect(page.locator("main").getByText(first.email)).toHaveCount(0);
  }).toPass({ timeout: 20_000 });

  await context.close();
});
