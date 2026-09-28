import { describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import {
  activateRubric,
  addCriterion,
  assignJudge,
  createRubric,
  startEvaluation,
  submitEvaluation,
} from "@dogfood/judging";
import { generateRankingSnapshot, publishRankingSnapshot } from "@dogfood/ranking";
import type { Actor } from "@dogfood/shared";
import { createProject, submitProject } from "@dogfood/submissions";
import { createTeam } from "@dogfood/teams";
import { db, eq, schema } from "@dogfood/db";

async function firstRubricCriterionId(rubricId: string): Promise<string> {
  const rows = await db
    .select({ id: schema.rubricCriteria.id })
    .from(schema.rubricCriteria)
    .where(eq(schema.rubricCriteria.rubricId, rubricId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("no rubric criteria");
  return row.id;
}

import { buildCsv, escapeCsv } from "../../packages/exports/src/csv";
import {
  EXPORTS,
  exportEvaluations,
  exportJudgeAssignments,
  exportParticipants,
  exportProjects,
  exportResults,
  exportTeams,
} from "../../packages/exports/src/service";
import { GET as getExport } from "../../apps/web/app/api/v1/events/[eventId]/exports/[name]/route";
import { resetDb } from "../fixtures/db";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

async function seedAuthUser(email: string, displayName = "Seed User") {
  const user = await registerUser({ email, password: "password123", displayName });
  const session = await createSession(user.id);
  const actor: Actor = { userId: user.id, isPlatformAdmin: false };
  return {
    userId: user.id,
    actor,
    email: user.email,
    displayName,
    cookie: `dogfood_session=${session.rawToken}`,
  };
}

const BASE = "http://dogfood.local";

async function routeRequest(path: string, cookie?: string): Promise<Request> {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE}${path}`, { method: "GET", headers });
}

function exportParams(eventId: string, name: string) {
  return Promise.resolve({ eventId, name });
}

describe("csv tooling", () => {
  it("preserves commas, quotes, and newlines with RFC4180 escaping", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
    expect(escapeCsv('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsv("a\r\nb")).toBe('"a\r\nb"');
    expect(escapeCsv("plain")).toBe("plain");
    expect(escapeCsv(42)).toBe("42");
    expect(escapeCsv(true)).toBe("true");
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
    expect(escapeCsv(new Date("2024-01-02T03:04:05.000Z"))).toBe(
      "2024-01-02T03:04:05.000Z",
    );
  });

  it("produces a header-only document for empty result sets", () => {
    expect(buildCsv(["a", "b"], [])).toBe("a,b\r\n");
  });

  it("renders header and rows with consistent quoting", () => {
    const csv = buildCsv(
      ["name", "note"],
      [["dogfood", 'it has, commas'], ["engine", "no problem"]],
    );
    expect(csv).toBe('name,note\r\ndogfood,"it has, commas"\r\nengine,no problem\r\n');
  });
});

describe("exports over authorized read models", () => {
  it("exports participants, teams, projects, assignments, evaluations, and published results for the organizer", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"), "Oda");
    const judge = await seedAuthUser(uniqueEmail("judge"), "Jana");
    const participant = await seedAuthUser(uniqueEmail("participant"), "Piper");

    const event = await createEvent(organizer.actor, {
      name: "Export Mix",
      slug: "export-mix",
      timezone: "UTC",
    });

    await grantEventMembership(organizer.actor, event.id, participant.userId, "PARTICIPANT");
    // Rosters lock when submissions open, so the team forms during registration.
    const team = await createTeam(participant.actor, event.id, {
      name: "Bravo, Team",
    });
    await transitionEvent(organizer.actor, event.id, "REGISTRATION");
    await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_OPEN");

    const project = await createProject(participant.actor, event.id, {
      teamId: team.id,
      title: "Neat, App",
      description: "Line one\nLine two with, commas",
      demoVideoUrl: "https://example.com/video",
      techTags: ["typescript", "react"],
    });
    await submitProject(participant.actor, event.id, project.id);

    const rubric = await createRubric(organizer.actor, event.id, {
      name: "Main rubric",
    });
    await addCriterion(organizer.actor, rubric.id, {
      name: "Quality",
      weight: 100,
      minScore: 0,
      maxScore: 10,
    });
    await activateRubric(organizer.actor, event.id, rubric.id);

    await transitionEvent(organizer.actor, event.id, "SUBMISSIONS_CLOSED");
    await transitionEvent(organizer.actor, event.id, "JUDGING");

    await grantEventMembership(organizer.actor, event.id, judge.userId, "JUDGE");
    const assignment = await assignJudge(organizer.actor, event.id, {
      judgeId: judge.userId,
      projectId: project.id,
    });
    const criterionId = await firstRubricCriterionId(rubric.id);

    await startEvaluation(judge.actor, event.id, assignment.id);
    await submitEvaluation(judge.actor, event.id, assignment.id, {
      scores: [
        {
          criterionId,
          score: 9,
          comment: "Very good",
        },
      ],
      overallComment: "Strong entry.",
    });

    const participants = await exportParticipants(organizer.actor, event.id);
    expect(participants.filename).toBe("participants.csv");
    expect(participants.content).toContain(participant.email);
    expect(participants.content).toContain("PARTICIPANT");

    const teams = await exportTeams(organizer.actor, event.id);
    expect(teams.filename).toBe("teams.csv");
    expect(teams.content).toContain('"Bravo, Team"');
    expect(teams.content).toContain(participant.email);

    const projects = await exportProjects(organizer.actor, event.id);
    expect(projects.filename).toBe("projects.csv");
    expect(projects.content).toContain('"Neat, App"');
    expect(projects.content).toContain('"Line one\nLine two with, commas"');
    expect(projects.content).toContain("typescript | react");

    const assignments = await exportJudgeAssignments(organizer.actor, event.id);
    expect(assignments.filename).toBe("judge-assignments.csv");
    expect(assignments.content).toContain(judge.email);
    expect(assignments.content).toContain("SUBMITTED");

    const evaluations = await exportEvaluations(organizer.actor, event.id);
    expect(evaluations.filename).toBe("evaluations.csv");
    expect(evaluations.content).toContain(judge.email);
    expect(evaluations.content).toContain(`${criterionId}=9`);

    await expect(
      exportResults(organizer.actor, event.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    const generated = await generateRankingSnapshot(organizer.actor, event.id, {
      normalizationStrategy: "z-score",
      minimumBatchSize: 1,
      tieBreakers: ["secondary-score", "project-id"],
    });
    await publishRankingSnapshot(organizer.actor, event.id, generated.id);

    const results = await exportResults(organizer.actor, event.id);
    expect(results.filename).toBe("results.csv");
    expect(results.content).toContain("1,");
    expect(results.content).toContain(project.id);
  });

  it("denies exports to non-organizers and rejects unknown events", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"), "Oda");
    const participant = await seedAuthUser(uniqueEmail("participant"), "Piper");

    const event = await createEvent(organizer.actor, {
      name: "Private",
      slug: "private",
      timezone: "UTC",
    });
    await grantEventMembership(organizer.actor, event.id, participant.userId, "PARTICIPANT");

    await expect(
      exportParticipants(participant.actor, event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      exportTeams(participant.actor, event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      exportResults(organizer.actor, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      exportParticipants(organizer.actor, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("exposes every export through the builder registry", () => {
    expect(Object.keys(EXPORTS).sort()).toEqual([
      "evaluations",
      "judge-assignments",
      "participants",
      "projects",
      "results",
      "teams",
    ]);
  });
});

describe("exports via the v1 route", () => {
  it("serves a CSV download to an organizer and rejects others", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"), "Oda");
    const participant = await seedAuthUser(uniqueEmail("participant"), "Piper");

    const event = await createEvent(organizer.actor, {
      name: "Route Export",
      slug: "route-export",
      timezone: "UTC",
    });
    await grantEventMembership(organizer.actor, event.id, participant.userId, "PARTICIPANT");

    const ok = await getExport(
      await routeRequest(
        `/api/v1/events/${event.id}/exports/participants.csv`,
        organizer.cookie,
      ),
      { params: exportParams(event.id, "participants.csv") },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(ok.headers.get("content-disposition")).toBe(
      'attachment; filename="participants.csv"',
    );

    const forbidden = await getExport(
      await routeRequest(
        `/api/v1/events/${event.id}/exports/participants.csv`,
        participant.cookie,
      ),
      { params: exportParams(event.id, "participants.csv") },
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      error: { code: "FORBIDDEN" },
    });
  });

  it("returns a typed 404 for an unknown export name", async () => {
    await resetDb();

    const organizer = await seedAuthUser(uniqueEmail("org"), "Oda");
    const event = await createEvent(organizer.actor, {
      name: "Route Export 2",
      slug: "route-export-2",
      timezone: "UTC",
    });

    const res = await getExport(
      await routeRequest(
        `/api/v1/events/${event.id}/exports/leaderboard.csv`,
        organizer.cookie,
      ),
      { params: exportParams(event.id, "leaderboard.csv") },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});