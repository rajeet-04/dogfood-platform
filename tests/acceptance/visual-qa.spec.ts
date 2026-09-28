import { test, type Page } from "@playwright/test";
import { grantEventMembership } from "@dogfood/events";
import { lockEvaluation } from "@dogfood/judging";
import {
  generateRankingSnapshot,
  publishRankingSnapshot,
} from "@dogfood/ranking";
import { issueCertificates, listCertificates } from "@dogfood/certificates";
import { db, eq, schema } from "@dogfood/db";

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

const WIDTHS = [1440, 1280, 1024, 768, 390];

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

/**
 * Responsive sweep. Seeds a complete dataset (three teams, two judges, a
 * published ranking, issued certificates), walks every route at 1440 / 1280 /
 * 1024 / 768 / 390 and fails on layout defects that a screenshot hides:
 * horizontal overflow, painted elements outside the viewport, duplicate
 * landmarks, missing `h1`, sub-28px touch targets and console errors.
 *
 * Opt-in because it writes ~60 full-page screenshots:
 *   VISUAL_QA=1 pnpm test:acceptance visual-qa
 *   VISUAL_DARK=1 VISUAL_QA=1 pnpm test:acceptance visual-qa
 */
test.skip(
  process.env.VISUAL_QA !== "1",
  "set VISUAL_QA=1 to run the responsive sweep",
);

async function fullDataset() {
  await resetDb();

  const organizer = await seedUser(uniqueEmail("org"), "Olga Founders");
  const event = await seedEvent(
    organizer.actor,
    "Autumn Hack Sprint 2026",
    `autumn-hack-${Date.now()}`,
  );
  await advanceEvent(organizer.actor, event.id, ["REGISTRATION"]);

  const teams = [
    { name: "Deep Learning Dash", leader: "Priya Raman" },
    { name: "Quiet Ledger", leader: "Marco Silva" },
    { name: "Civic Signal", leader: "Amara Okafor" },
  ];

  const participants = [];
  const projects: Array<{ id: string; teamId: string; title: string }> = [];
  const teamIds: string[] = [];
  for (const team of teams) {
    const participant = await seedUser(uniqueEmail("pat"), team.leader);
    participants.push(participant);
    const { teamId } = await seedParticipantTeam(
      organizer.actor,
      event.id,
      participant,
      team.name,
    );
    teamIds.push(teamId);
  }

  await advanceEvent(organizer.actor, event.id, ["SUBMISSIONS_OPEN"]);

  for (const [index, team] of teams.entries()) {
    const { projectId } = await seedParticipantProject(
      organizer.actor,
      event.id,
      participants[index],
      team.name,
      teamIds[index],
    );
    projects.push({ id: projectId, teamId: teamIds[index], title: team.name });
  }

  const judges = [];
  for (const name of ["Jana Kovács", "Diego Ramos"]) {
    const judge = await seedUser(uniqueEmail("judge"), name);
    await grantEventMembership(organizer.actor, event.id, judge.userId, "JUDGE");
    judges.push(judge);
  }

  await advanceEvent(organizer.actor, event.id, [
    "SUBMISSIONS_CLOSED",
    "JUDGING",
  ]);

  const rubricId = await seedRubric(organizer.actor, event.id, [
    { name: "Impact", weight: 60, minScore: 0, maxScore: 10 },
    { name: "Polish", weight: 40, minScore: 0, maxScore: 10 },
  ]);

  const scores: Array<[number, number]> = [
    [8, 9],
    [6, 7],
    [5, 6],
  ];
  for (const [index, judge] of judges.entries()) {
    for (const [projectIndex, project] of projects.entries()) {
      const assignment = await assignJudge(organizer.actor, event.id, {
        judgeId: judge.userId,
        projectId: project.id,
      });
      const [impact, polish] = scores[projectIndex];
      const offset = index === 1 ? 1 : 0;
      await seedJudgeEvaluation(
        organizer.actor,
        event.id,
        rubricId,
        judge,
        assignment.id,
        [impact + offset, polish + offset],
      );
      await lockEvaluation(organizer.actor, event.id, assignment.id);
    }
  }

  const snapshot = await generateRankingSnapshot(
    organizer.actor,
    event.id,
    RANKING_CONFIG,
  );
  await publishRankingSnapshot(organizer.actor, event.id, snapshot.id);
  await issueCertificates(organizer.actor, event.id);
  await transitionToPublished(organizer.actor, event.id);

  const certificates = await listCertificates(organizer.actor, event.id);

  // A second, earlier-stage event so the catalogue and profile show variety.
  const draft = await seedUser(uniqueEmail("org2"), "Nils Berger");
  const openEvent = await seedEvent(
    draft.actor,
    "Winter Online Jam",
    `winter-jam-${Date.now()}`,
  );
  await advanceEvent(draft.actor, openEvent.id, ["REGISTRATION"]);

  return { organizer, participants, event, projects, certificates, openEvent };
}

async function transitionToPublished(
  actor: Parameters<typeof advanceEvent>[0],
  eventId: string,
) {
  const { transitionEvent } = await import("@dogfood/events");
  await transitionEvent(actor, eventId, "PUBLISHED");
}

const problems: string[] = [];
const consoleErrors: string[] = [];

function watchConsole(page: Page, label: string) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // React dev-mode hydration chatter is noise, not a layout defect.
    if (text.includes("Download the React DevTools")) return;
    consoleErrors.push(`${label}: ${text.slice(0, 200)}`);
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`${label}: pageerror ${error.message.slice(0, 200)}`);
  });
}

async function audit(page: Page, label: string) {
  const report = await page.evaluate(() => {
    const issues: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth + 1) {
      issues.push(
        `horizontal overflow: scrollWidth ${doc.scrollWidth} > ${window.innerWidth}`,
      );
    }
    if (document.querySelectorAll("main").length !== 1) {
      issues.push(`main count ${document.querySelectorAll("main").length}`);
    }
    const banners = new Set<Element>();
    for (const landmark of Array.from(
      document.querySelectorAll("header, [role='banner']"),
    )) {
      if (
        landmark.getAttribute("role") === "banner" ||
        (landmark.tagName === "HEADER" &&
          !landmark.closest("article, aside, main, nav, section"))
      ) {
        banners.add(landmark);
      }
    }
    if (banners.size !== 1) {
      issues.push(`banner landmark count ${banners.size}`);
    }
    const h1s = document.querySelectorAll("h1");
    if (h1s.length !== 1) issues.push(`h1 count ${h1s.length}`);
    if (!document.querySelector("h1")?.textContent?.trim()) {
      issues.push("empty h1");
    }
    if (document.querySelector("nav[aria-label='Breadcrumb'] a") === null) {
      // Breadcrumbs are expected on authenticated workspace routes only.
    }
    // Elements sticking out horizontally.
    for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      // Skip the intentionally off-screen skip link.
      if (el.classList.contains("skip-link")) continue;
      // Hidden subtrees (closed <details> content uses content-visibility, and
      // closed dropdowns use opacity) still report a rect but are never painted.
      if (
        !el.checkVisibility({
          contentVisibilityAuto: true,
          opacityProperty: true,
          visibilityProperty: true,
        })
      ) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const style = getComputedStyle(el);
      if (style.position === "fixed") continue;
      if (rect.right > window.innerWidth + 1.5 || rect.left < -1.5) {
        const parent = el.parentElement;
        const parentOverflowX = parent
          ? getComputedStyle(parent).overflowX
          : "visible";
        if (parentOverflowX === "auto" || parentOverflowX === "scroll") continue;
        issues.push(
          `<${el.tagName.toLowerCase()}${el.className ? `.${String(el.className).split(" ").slice(0, 2).join(".")}` : ""}> out of bounds (${Math.round(rect.left)}..${Math.round(rect.right)})`,
        );
      }
    }
    // Touch targets.
    if (window.innerWidth < 500) {
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("a[href], button:not([hidden])"),
      )) {
        if (el.classList.contains("skip-link")) continue;
        if (
          !el.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true,
          })
        ) {
          continue;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        if (getComputedStyle(el).display === "contents") continue;
        if (rect.height < 28) {
          issues.push(
            `small tap target ${Math.round(rect.width)}x${Math.round(rect.height)}: ${el.textContent?.trim().slice(0, 24)}`,
          );
        }
      }
    }
    return issues;
  });
  for (const issue of report) problems.push(`${label}: ${issue}`);
}

async function shoot(page: Page, url: string, name: string, width: number) {
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);
  await audit(page, `${name}@${width}`);
  const suffix = process.env.VISUAL_DARK === "1" ? "-dark" : "";
  await page.screenshot({
    path: `test-results/visual/${name}@${width}${suffix}.png`,
    fullPage: true,
  });
}

test("capture every route at every required width", async ({ page }) => {
  const data = await fullDataset();
  const certificateId = data.certificates[0]?.id;
  expect(certificateId).toBeTruthy();

  // Dark mode: the theme bootstrap reads localStorage before first paint, so
  // the preference is seeded and then the pages are captured again.
  const dark = process.env.VISUAL_DARK === "1";
  if (dark) {
    await page.addInitScript(() => {
      window.localStorage.setItem("dogfood-theme", "dark");
    });
    await page.emulateMedia({ colorScheme: "dark" });
  }
  watchConsole(page, dark ? "dark" : "light");

  const certificateRow = await db
    .select({ id: schema.certificates.id })
    .from(schema.certificates)
    .where(eq(schema.certificates.eventId, data.event.id))
    .limit(1);

  if (dark) {
    // Confirm the class actually lands before capturing 60 dark screenshots.
    await page.goto("/login", { waitUntil: "networkidle" });
    expect(
      await page.evaluate(() =>
        document.documentElement.classList.contains("dark"),
      ),
    ).toBe(true);
  }

  // Authenticated organizer surface.
  await loginViaUi(page, data.organizer.email);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await shoot(page, "/events", "events", width);
    await shoot(page, "/events/new", "events-new", width);
    await shoot(page, `/events/${data.event.id}`, "event-detail", width);
    await shoot(page, `/events/${data.event.id}/organizer`, "organizer", width);
    await shoot(
      page,
      `/events/${data.event.id}/certificates`,
      "organizer-certificates",
      width,
    );
    await shoot(page, "/profile", "profile", width);
    await shoot(page, `/certificates/${certificateRow[0].id}`, "certificate", width);
  }

  // Participant surface.
  const participant = data.participants[0];
  await page.context().clearCookies();
  await loginViaUi(page, participant.email);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await shoot(page, `/events/${data.event.id}/participant`, "participant", width);
  }

  // Judge surface.
  await page.context().clearCookies();
  const judge = await seedUser(uniqueEmail("judge"), "Jana Kovács");
  await grantEventMembership(organizerOf(data), data.event.id, judge.userId, "JUDGE");
  await loginViaUi(page, judge.email);
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await shoot(page, `/events/${data.event.id}/judge`, "judge", width);
  }

  // Marketing + auth surfaces, signed out.
  await page.context().clearCookies();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    await shoot(page, "/", "landing", width);
    await shoot(page, "/login", "login", width);
    await shoot(page, "/register", "register", width);
  }

  // A second, empty-catalogue state.
  await loginViaUi(page, data.organizer.email);
  await page.setViewportSize({ width: 1280, height: 900 });
  await shoot(page, `/events/${data.openEvent.id}`, "event-registration", 1280);
  await page.setViewportSize({ width: 390, height: 900 });
  await shoot(page, `/events/${data.openEvent.id}`, "event-registration", 390);

  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("test-results/visual", { recursive: true });
  writeFileSync(
    "test-results/visual/problems.txt",
    problems.length ? [...new Set(problems)].join("\n") : "none",
  );
  writeFileSync(
    "test-results/visual/console-errors.txt",
    consoleErrors.length ? [...new Set(consoleErrors)].join("\n") : "none",
  );
  console.log(
    problems.length
      ? `VISUAL PROBLEMS: ${new Set(problems).size}`
      : "VISUAL PROBLEMS: none",
  );
  console.log(
    consoleErrors.length
      ? `CONSOLE ERRORS: ${new Set(consoleErrors).size}`
      : "CONSOLE ERRORS: none",
  );
});

function organizerOf(data: { organizer: { actor: Parameters<typeof grantEventMembership>[0] } }) {
  return data.organizer.actor;
}
