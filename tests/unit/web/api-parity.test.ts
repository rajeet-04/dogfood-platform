import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const APP = join(ROOT, "apps/web/app");
const ACTIONS = join(ROOT, "apps/web/server/actions");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/**
 * Every UI Server Action and the REST operation that performs the same domain
 * call. Adding a Server Action without a REST twin fails this test.
 */
const ACTION_TO_API: Record<string, string> = {
  registerAction: "POST /api/v1/auth/register",
  loginAction: "POST /api/v1/auth/login",
  logoutAction: "POST /api/v1/auth/logout",
  switchAccountAction: "POST /api/v1/auth/switch",
  signOutAccountAction: "POST /api/v1/auth/sign-out",
  signOutAllAction: "POST /api/v1/auth/sign-out",
  issueCertificatesAction: "POST /api/v1/events/{eventId}/certificates",
  revokeCertificatesAction: "DELETE /api/v1/events/{eventId}/certificates",
  createEventAction: "POST /api/v1/events",
  updateRegistrationWindowAction: "PUT /api/v1/events/{eventId}/registration-window",
  updateEventDetailsAction: "PUT /api/v1/events/{eventId}",
  transitionEventAction: "POST /api/v1/events/{eventId}/transition",
  applyAsJudgeAction: "POST /api/v1/events/{eventId}/judge-applications",
  withdrawJudgeApplicationAction: "DELETE /api/v1/events/{eventId}/judge-applications",
  decideJudgeApplicationAction: "PATCH /api/v1/events/{eventId}/judge-applications/{applicationId}",
  deactivateJudgeAction: "DELETE /api/v1/events/{eventId}/judges/{userId}",
  markNotificationsReadAction: "POST /api/v1/notifications/read",
  generateRankingAction: "POST /api/v1/events/{eventId}/rankings",
  publishRankingAction: "POST /api/v1/events/{eventId}/rankings/{snapshotId}/publish",
  joinEventAction: "POST /api/v1/events/{eventId}/join",
  addMemberAction: "POST /api/v1/events/{eventId}/members",
  changeMemberRoleAction: "PATCH /api/v1/events/{eventId}/members/{userId}",
  removeMemberAction: "DELETE /api/v1/events/{eventId}/members/{userId}",
  startEvaluationAction: "POST /api/v1/events/{eventId}/evaluations/{assignmentId}/start",
  saveEvaluationDraftAction: "PUT /api/v1/events/{eventId}/evaluations/{assignmentId}",
  reopenEvaluationAction: "POST /api/v1/events/{eventId}/evaluations/{assignmentId}/reopen",
  submitEvaluationAction: "POST /api/v1/events/{eventId}/evaluations/{assignmentId}",
  unassignJudgeAction: "DELETE /api/v1/events/{eventId}/judge-assignments/{assignmentId}",
  lockEvaluationAction: "POST /api/v1/events/{eventId}/evaluations/{assignmentId}/lock",
  lockAllSubmissionsAction: "POST /api/v1/events/{eventId}/bulk/evaluations/lock",
  createTeamAction: "POST /api/v1/events/{eventId}/teams",
  createTeamInviteAction: "POST /api/v1/events/{eventId}/teams/{teamId}/invitations",
  leaveTeamAction: "POST /api/v1/events/{eventId}/teams/{teamId}/leave",
  joinTeamAction: "POST /api/v1/events/{eventId}/teams/join",
  createRubricAction: "POST /api/v1/events/{eventId}/rubrics",
  addCriterionAction: "POST /api/v1/events/{eventId}/rubrics/{rubricId}/criteria",
  activateRubricAction: "POST /api/v1/events/{eventId}/rubrics/{rubricId}/activate",
  assignJudgeAction: "POST /api/v1/events/{eventId}/judge-assignments",
  addPrizeAction: "POST /api/v1/events/{eventId}/prizes",
  updatePrizeAction: "PATCH /api/v1/events/{eventId}/prizes/{prizeId}",
  removePrizeAction: "DELETE /api/v1/events/{eventId}/prizes/{prizeId}",
  addTrackAction: "POST /api/v1/events/{eventId}/tracks",
  updateTrackAction: "PATCH /api/v1/events/{eventId}/tracks/{trackId}",
  moveTrackAction: "POST /api/v1/events/{eventId}/tracks/{trackId}/order",
  removeTrackAction: "DELETE /api/v1/events/{eventId}/tracks/{trackId}",
  addQuestionAction: "POST /api/v1/events/{eventId}/custom-questions",
  updateQuestionAction: "PATCH /api/v1/events/{eventId}/custom-questions/{questionId}",
  moveQuestionAction: "POST /api/v1/events/{eventId}/custom-questions/{questionId}/order",
  removeQuestionAction: "DELETE /api/v1/events/{eventId}/custom-questions/{questionId}",
  createProjectAction: "POST /api/v1/events/{eventId}/projects",
  reviseProjectAction: "PATCH /api/v1/events/{eventId}/projects/{projectId}",
  submitProjectAction: "POST /api/v1/events/{eventId}/projects/{projectId}/submit",
  withdrawProjectAction: "POST /api/v1/events/{eventId}/projects/{projectId}/withdraw",
  lockProjectAction: "POST /api/v1/events/{eventId}/projects/{projectId}/lock",
  lockAllProjectsAction: "POST /api/v1/events/{eventId}/bulk/projects/lock",
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

/** "METHOD /path" for every implemented route handler. */
function implementedOperations(): Set<string> {
  const operations = new Set<string>();
  for (const file of routeFiles(APP)) {
    const path = "/" + relative(APP, file).split(sep).slice(0, -1).join("/")
      .replace(/\[([^\]]+)\]/g, "{$1}");
    const source = readFileSync(file, "utf8");
    for (const method of METHODS) {
      if (new RegExp(`export (async )?function ${method}\\b|export const ${method}\\b`).test(source)) {
        operations.add(`${method} ${path}`);
      }
    }
  }
  return operations;
}

/** "METHOD /path" for every operation documented in openapi.yaml. */
function documentedOperations(): Set<string> {
  const operations = new Set<string>();
  let path: string | null = null;
  for (const line of readFileSync(join(ROOT, "openapi.yaml"), "utf8").split("\n")) {
    const pathMatch = /^ {2}(\/\S*):\s*$/.exec(line);
    if (pathMatch) path = pathMatch[1];
    else if (/^\S/.test(line)) path = null;
    const methodMatch = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line);
    if (path && methodMatch) operations.add(`${methodMatch[1].toUpperCase()} ${path}`);
  }
  return operations;
}

/**
 * Exported actor-driven mutations that intentionally write no audit row of
 * their own. Every other one must call appendAuditEvent, which is what queues
 * webhook deliveries.
 */
const AUDIT_EXEMPT = new Set([
  "judging/assignJudge", // delegates to assignJudges, which audits
  "judging/lockAllEvaluations", // delegates to lockEvaluation per row
  "judging/generateAssignmentProposal", // read-only preview
  "notifications/actorDisplayName", // read helper
  "notifications/markRead", // per-user inbox state, not an event action
  "notifications/markAllRead",
]);
const READ_ONLY = /^(get|list|read|query|find|verify|export|preview|count|resolve|load|can|build|render|require|dispatch)/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") && !entry.name.includes("repository") ? [path] : [];
  });
}

function serverActions(): string[] {
  return readdirSync(ACTIONS)
    .filter((name) => name.endsWith(".ts") && name !== "common.ts")
    .flatMap((name) => [
      ...readFileSync(join(ACTIONS, name), "utf8").matchAll(/^export async function (\w+)/gm),
    ].map((match) => match[1]));
}

describe("UI/API parity contract", () => {
  it("maps every UI Server Action to an implemented REST operation", () => {
    const implemented = implementedOperations();
    const actions = serverActions();
    expect(actions.filter((name) => !(name in ACTION_TO_API))).toEqual([]);
    expect(Object.keys(ACTION_TO_API).filter((name) => !actions.includes(name))).toEqual([]);
    expect(Object.values(ACTION_TO_API).filter((op) => !implemented.has(op))).toEqual([]);
  });

  it("documents exactly the implemented operations in openapi.yaml", () => {
    const implemented = implementedOperations();
    const documented = documentedOperations();
    expect([...implemented].filter((op) => !documented.has(op)).sort()).toEqual([]);
    expect([...documented].filter((op) => !implemented.has(op)).sort()).toEqual([]);
  });

  it("audits every actor-driven domain mutation so it can reach webhooks", () => {
    const unaudited: string[] = [];
    const packages = readdirSync(join(ROOT, "packages")).filter((name) => name !== "db");
    const files = [
      ...packages.flatMap((name) => sourceFiles(join(ROOT, "packages", name, "src"))),
      join(ROOT, "apps/web/server/assets.ts"),
    ];
    for (const file of files) {
      const owner = file.includes(`${sep}packages${sep}`) ? relative(join(ROOT, "packages"), file).split(sep)[0] : "web";
      for (const chunk of readFileSync(file, "utf8").split(/\nexport async function /).slice(1)) {
        const name = chunk.slice(0, chunk.indexOf("("));
        const params = chunk.slice(0, chunk.indexOf(")"));
        if (!/\bactor\b/.test(params) || READ_ONLY.test(name)) continue;
        if (AUDIT_EXEMPT.has(`${owner}/${name}`)) continue;
        if (!/appendAuditEvent|audit\w*\(/i.test(chunk)) unaudited.push(`${owner}/${name}`);
      }
    }
    expect(unaudited).toEqual([]);
  });
});
