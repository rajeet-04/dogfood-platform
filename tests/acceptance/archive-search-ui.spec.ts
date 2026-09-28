import { expect, test } from "@playwright/test";

import { createEvent, transitionEvent } from "@dogfood/events";

import {
  loginViaUi,
  resetDb,
  seedUser,
  uniqueEmail,
} from "./helpers";

const CHAIN_TO_PUBLISHED = [
  "REGISTRATION",
  "SUBMISSIONS_OPEN",
  "SUBMISSIONS_CLOSED",
  "JUDGING",
  "RESULTS_READY",
  "PUBLISHED",
] as const;

async function advance(
  actor: import("@dogfood/shared").Actor,
  eventId: string,
  states: readonly string[],
): Promise<void> {
  for (const to of states) {
    await transitionEvent(actor, eventId, to as never);
  }
}

test("organizer archives and unarchives an event from the dashboard", async ({
  browser,
}) => {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("arch-ui"), "Arch UI");
  const event = await createEvent(organizer.actor, {
    slug: `arch-ui-${Date.now()}`,
    name: "Archive Drill",
    timezone: "UTC",
  });
  await advance(organizer.actor, event.id, CHAIN_TO_PUBLISHED);

  const context = await browser.newContext();
  const page = await context.newPage();
  await loginViaUi(page, organizer.email);

  await page.goto(`/events/${event.id}/organizer`);
  const archiveButton = page.getByRole("button", {
    name: "Advance to Archived",
  });
  await expect(archiveButton).toBeVisible({ timeout: 15_000 });
  await archiveButton.click();
  await expect(
    page.getByRole("button", { name: "Unarchive event" }),
  ).toBeVisible({ timeout: 15_000 });

  await page.goto(`/events/${event.id}`);
  await expect(page.getByTestId("archived-notice")).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(`/events/${event.id}/organizer`);
  const unarchiveButton = page.getByRole("button", {
    name: "Unarchive event",
  });
  await expect(unarchiveButton).toBeVisible({ timeout: 15_000 });
  await unarchiveButton.click({ force: true });
  await expect(
    page.getByRole("button", { name: "Advance to Archived" }),
  ).toBeVisible({ timeout: 15_000 });

  await page.goto(`/events/${event.id}`);
  await expect(page.getByTestId("archived-notice")).toHaveCount(0);

  await context.close();
});

test("catalogue search filters events; drafts and archives stay out of public results", async ({
  browser,
}) => {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("cat-ui"), "Cat UI");
  const live = await createEvent(organizer.actor, {
    slug: `cat-ui-live-${Date.now()}`,
    name: "Zenith Hack",
    timezone: "UTC",
  });
  await transitionEvent(organizer.actor, live.id, "REGISTRATION");
  const draft = await createEvent(organizer.actor, {
    slug: `cat-ui-draft-${Date.now()}`,
    name: "Secret Draft",
    timezone: "UTC",
  });
  const old = await createEvent(organizer.actor, {
    slug: `cat-ui-old-${Date.now()}`,
    name: "Old Zenith",
    timezone: "UTC",
  });
  await advance(organizer.actor, old.id, [
    ...CHAIN_TO_PUBLISHED,
    "ARCHIVED",
  ]);

  const anonymous = await browser.newContext();
  const anonPage = await anonymous.newPage();
  await anonPage.goto("/events");

  const liveCard = anonPage.getByText("Zenith Hack");
  await expect(liveCard).toBeVisible({ timeout: 15_000 });
  await expect(anonPage.getByText("Secret Draft")).toHaveCount(0);
  await expect(anonPage.getByText("Old Zenith")).toHaveCount(0);

  await anonPage.getByLabel("Search events").fill("Zenith");
  await anonPage.getByRole("button", { name: "Search" }).click();
  await expect(anonPage.getByText("Zenith Hack")).toBeVisible();
  await expect(anonPage.getByText("Secret Draft")).toHaveCount(0);
  await expect(anonPage.getByText("Old Zenith")).toHaveCount(0);
  await expect(anonPage.getByText("Showing 1 event.")).toBeVisible();

  await anonPage.getByLabel("Search events").fill("zzz");
  await anonPage.getByRole("button", { name: "Search" }).click();
  await expect(
    anonPage.getByText("No events match your search."),
  ).toBeVisible();

  await anonPage.getByRole("link", { name: "Clear" }).click();
  await expect(anonPage.getByText("Zenith Hack")).toBeVisible({ timeout: 15_000 });

  await anonymous.close();

  const owner = await browser.newContext();
  const ownerPage = await owner.newPage();
  await loginViaUi(ownerPage, organizer.email);

  await expect(ownerPage.getByText("Secret Draft")).toBeVisible({
    timeout: 15_000,
  });
  await expect(ownerPage.getByText("Zenith Hack")).toBeVisible();
  await expect(ownerPage.getByText("Old Zenith")).toBeVisible();

  const archivedCard = ownerPage.getByRole("link", {
    name: /Old Zenith/,
  });
  await expect(archivedCard).toBeVisible();
  await expect(archivedCard).toContainText("Archived");

  await owner.close();
});

test("a public event page resolves both the event id and its slug", async ({
  browser,
}) => {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("slug-ui"), "Slug UI");
  const event = await createEvent(organizer.actor, {
    slug: `slug-ui-${Date.now()}`,
    name: "Slug Addressable",
    timezone: "UTC",
  });
  await transitionEvent(organizer.actor, event.id, "REGISTRATION");

  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`/events/${event.id}`);
  await expect(page.getByRole("heading", { name: "Slug Addressable" })).toBeVisible({
    timeout: 15_000,
  });

  // A slug is not a uuid, so it used to blow up the id comparison.
  await page.goto(`/events/${event.slug}`);
  await expect(page.getByRole("heading", { name: "Slug Addressable" })).toBeVisible({
    timeout: 15_000,
  });

  const missing = await page.goto("/events/no-such-event-slug");
  expect(missing?.status()).toBe(404);

  await context.close();
});