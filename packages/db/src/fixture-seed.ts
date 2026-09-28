import { createHash, randomBytes } from "node:crypto";

import { db } from "./client";
import * as schema from "./schema";

type Fixture = {
  event: { id: string; name: string; submissions_close: string };
  tracks: Array<{ id: string; name: string }>;
  judges: Array<{ id: string; name: string; email: string; tracks: string[] }>;
  teams: Array<{ id: string; name: string; members: string[] }>;
  projects: Array<{
    id: string;
    team: string;
    track: string;
    title: string;
    summary: string;
    repo_url: string;
    submitted_at: string;
  }>;
  scores: Array<{
    judge: string;
    project: string;
    criteria: Record<string, number>;
    comment: string;
  }>;
};

const CRITERIA = ["functionality", "quality", "innovation"] as const;
const WEIGHTS = ["0.33334", "0.33333", "0.33333"] as const;
const LOCAL_FIXTURE_SESSION_TOKENS = {
  organizer: "dogfood-local-fixture-organizer-v1",
  judgeA: "dogfood-local-fixture-judge-a-v1",
  judgeB: "dogfood-local-fixture-judge-b-v1",
  participant: "dogfood-local-fixture-participant-v1",
} as const;

export type FixtureAuthRole = keyof typeof LOCAL_FIXTURE_SESSION_TOKENS;

export function fixtureSeedingEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  const requested = env.DOGFOOD_SEED_FIXTURES === "1";
  if (requested && env.DOGFOOD_MODE !== "local") {
    throw new Error("DOGFOOD_SEED_FIXTURES=1 requires DOGFOOD_MODE=local; fixture users and credentials are local-only");
  }
  return requested;
}

export function fixtureSessionToken(
  role: FixtureAuthRole,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string {
  return fixtureSeedingEnabled(env)
    ? LOCAL_FIXTURE_SESSION_TOKENS[role]
    : randomBytes(32).toString("base64url");
}

/** Stable fixture IDs make a second boot an additive no-op for domain records. */
function fixtureId(kind: string, sourceId: string): string {
  const hash = createHash("sha256")
    .update(`dogfood-official-fixture:${kind}:${sourceId}`)
    .digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function requireFixture(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid official fixture: ${message}`);
}

export async function seedOfficialFixture(fixture: Fixture) {
  requireFixture(fixture.event?.id && fixture.event?.name, "event is missing");
  requireFixture(!Number.isNaN(Date.parse(fixture.event.submissions_close)), "submission close date is invalid");
  const canonicalByTeam = new Map<string, Fixture["projects"][number]>();
  const canonicalProjects: Fixture["projects"] = [];
  const anomalousProjects: Array<{
    project: Fixture["projects"][number];
    canonical: Fixture["projects"][number];
  }> = [];
  for (const project of fixture.projects) {
    const first = canonicalByTeam.get(project.team);
    if (first) anomalousProjects.push({ project, canonical: first });
    else {
      canonicalByTeam.set(project.team, project);
      canonicalProjects.push(project);
    }
  }
  const canonicalIds = new Set(canonicalProjects.map((project) => project.id));
  const scoreKeys = new Set<string>();
  const canonicalScores = fixture.scores.filter((score) => canonicalIds.has(score.project));
  for (const score of canonicalScores) {
    const key = `${score.project}:${score.judge}`;
    requireFixture(!scoreKeys.has(key), `duplicate canonical score ${key}`);
    scoreKeys.add(key);
    for (const criterion of CRITERIA) {
      requireFixture(
        Number.isFinite(score.criteria[criterion]) && score.criteria[criterion] >= 1 && score.criteria[criterion] <= 5,
        `invalid ${criterion} score for ${key}`,
      );
    }
  }
  requireFixture(
    canonicalScores.length + anomalousProjects.reduce(
      (count, { project }) => count + fixture.scores.filter((score) => score.project === project.id).length,
      0,
    ) === fixture.scores.length,
    "score references an unknown project",
  );
  requireFixture(canonicalProjects.length === fixture.teams.length, "each team needs one canonical project");

  const eventId = fixtureId("event", fixture.event.id);
  const organizerId = fixtureId("user", "fixture-organizer@dogfood.local");
  const rubricId = fixtureId("rubric", fixture.event.id);
  const participantEmail = fixture.teams[0]?.members[0];
  requireFixture(participantEmail, "at least one participant is required");
  const participantId = fixtureId("user", participantEmail.toLowerCase());
  const judgeIds = Object.fromEntries(
    fixture.judges.map((judge) => [judge.id, fixtureId("user", judge.email.toLowerCase())]),
  );
  const projectIds = Object.fromEntries(
    canonicalProjects.map((project) => [project.id, fixtureId("project", project.id)]),
  );

  await db.transaction(async (tx) => {
    const fixtureUsers = [
      { email: "fixture-organizer@dogfood.local", displayName: "Fixture Organizer" },
      ...fixture.judges.map((judge) => ({ email: judge.email, displayName: judge.name })),
      ...fixture.teams.flatMap((team) => team.members.map((email) => ({ email, displayName: email.split("@")[0] ?? email }))),
    ];
    for (const user of fixtureUsers) {
      await tx.insert(schema.users).values({
        id: fixtureId("user", user.email.toLowerCase()),
        email: user.email,
        displayName: user.displayName,
        passwordHash: "!fixture-session-only",
      }).onConflictDoNothing();
    }
    await tx.insert(schema.events).values({
      id: eventId,
      slug: "official-fixture-sample-hack-2026",
      name: fixture.event.name,
      description: "Official DOGFOOD acceptance fixture",
      timezone: "UTC",
      state: "JUDGING",
      submissionClosesAt: new Date(fixture.event.submissions_close),
      createdBy: organizerId,
    }).onConflictDoNothing();
    await tx.insert(schema.eventMemberships).values({
      id: fixtureId("membership", `${eventId}:${organizerId}`), eventId, userId: organizerId, role: "ORGANIZER",
    }).onConflictDoNothing();
    for (const track of fixture.tracks) {
      await tx.insert(schema.eventTracks).values({
        id: fixtureId("track", track.id), eventId, name: track.name,
        sortOrder: fixture.tracks.indexOf(track),
      }).onConflictDoNothing();
    }
    for (const judge of fixture.judges) {
      const judgeId = judgeIds[judge.id];
      requireFixture(judgeId, `unknown judge ${judge.id}`);
      await tx.insert(schema.eventMemberships).values({
        id: fixtureId("membership", `${eventId}:${judgeId}`), eventId, userId: judgeId, role: "JUDGE",
      }).onConflictDoNothing();
      for (const trackId of judge.tracks) {
        requireFixture(fixture.tracks.some((track) => track.id === trackId), `unknown judge track ${trackId}`);
        await tx.insert(schema.judgeTrackScopes).values({
          eventId, judgeId, trackId: fixtureId("track", trackId),
        }).onConflictDoNothing();
      }
    }
    for (const team of fixture.teams) {
      const owner = team.members[0];
      requireFixture(owner, `team ${team.id} has no owner`);
      const teamId = fixtureId("team", team.id);
      await tx.insert(schema.teams).values({
        id: teamId, eventId, name: team.name,
        createdBy: fixtureId("user", owner.toLowerCase()),
      }).onConflictDoNothing();
      for (const email of team.members) {
        const userId = fixtureId("user", email.toLowerCase());
        await tx.insert(schema.eventMemberships).values({
          id: fixtureId("membership", `${eventId}:${userId}`), eventId, userId, role: "PARTICIPANT",
        }).onConflictDoNothing();
        await tx.insert(schema.teamMembers).values({
          eventId, teamId, userId, isOwner: email === owner,
        }).onConflictDoNothing();
      }
    }
    for (const project of canonicalProjects) {
      const team = fixture.teams.find((item) => item.id === project.team);
      requireFixture(team?.members[0], `project ${project.id} has no team`);
      requireFixture(fixture.tracks.some((track) => track.id === project.track), `project ${project.id} has unknown track`);
      const projectId = projectIds[project.id];
      const revisionId = fixtureId("revision", project.id);
      const submittedAt = new Date(project.submitted_at);
      requireFixture(!Number.isNaN(submittedAt.valueOf()), `invalid submitted_at for ${project.id}`);
      await tx.insert(schema.projects).values({
        id: projectId, eventId, teamId: fixtureId("team", project.team),
        slug: project.id, state: "SUBMITTED", currentRevisionId: revisionId,
        submittedAt,
      }).onConflictDoNothing();
      await tx.insert(schema.projectRevisions).values({
        id: revisionId, projectId, revisionNumber: 1, title: project.title,
        tagline: project.summary, description: project.summary,
        repositoryUrl: project.repo_url, trackId: fixtureId("track", project.track),
        createdBy: fixtureId("user", team.members[0].toLowerCase()),
      }).onConflictDoNothing();
    }
    for (const { project, canonical } of anomalousProjects) {
      await tx.insert(schema.fixtureImportAnomalies).values({
        id: fixtureId("anomaly", project.id), eventId,
        sourceProjectId: project.id, canonicalSourceProjectId: canonical.id,
        projectRecord: project as Record<string, unknown>,
        scoreRecords: fixture.scores.filter((score) => score.project === project.id) as Array<Record<string, unknown>>,
      }).onConflictDoNothing();
    }
    await tx.insert(schema.rubrics).values({
      id: rubricId, eventId, name: "Official fixture rubric", version: 1, active: true,
    }).onConflictDoNothing();
    for (const [index, name] of CRITERIA.entries()) {
      await tx.insert(schema.rubricCriteria).values({
        id: fixtureId("criterion", name), rubricId, name,
        weight: WEIGHTS[index], minScore: "1", maxScore: "5", sortOrder: index,
      }).onConflictDoNothing();
    }
    for (const score of canonicalScores) {
      const judgeId = judgeIds[score.judge];
      const projectId = projectIds[score.project];
      requireFixture(judgeId && projectId, `unknown score reference ${score.judge}/${score.project}`);
      const key = `${score.judge}:${score.project}`;
      const assignmentId = fixtureId("assignment", key);
      const evaluationId = fixtureId("evaluation", key);
      const scoresJson = CRITERIA.map((name) => ({
        criterionId: fixtureId("criterion", name),
        score: score.criteria[name], comment: null,
      }));
      await tx.insert(schema.judgeAssignments).values({
        id: assignmentId, eventId, judgeId, projectId,
        status: "SUBMITTED", assignedBy: organizerId,
      }).onConflictDoNothing();
      await tx.insert(schema.evaluations).values({
        id: evaluationId, assignmentId, rubricId, state: "SUBMITTED",
        currentRevision: 1, overallComment: score.comment,
        submittedAt: new Date(),
      }).onConflictDoNothing();
      for (const item of scoresJson) {
        await tx.insert(schema.evaluationScores).values({
          evaluationId, criterionId: item.criterionId,
          score: String(item.score), comment: item.comment,
        }).onConflictDoNothing();
      }
      await tx.insert(schema.evaluationRevisions).values({
        id: fixtureId("evaluation-revision", key), evaluationId,
        revisionNumber: 1, scoresJson,
        overallComment: score.comment, changedBy: judgeId,
      }).onConflictDoNothing();
    }
  });
  return {
    eventId, organizerId, participantId, judgeIds, projectIds,
    counts: {
      tracks: fixture.tracks.length, judges: fixture.judges.length,
      teams: fixture.teams.length, projects: canonicalProjects.length,
      scores: canonicalScores.length, anomalies: anomalousProjects.length,
    },
  };
}

/** Print local-only session cookies for the four official acceptance roles. */
export async function printFixtureAuthHeaders(
  fixture: Fixture,
  seeded: Awaited<ReturnType<typeof seedOfficialFixture>>,
): Promise<void> {
  const firstProject = fixture.projects.find((project) =>
    fixture.scores.filter((score) => score.project === project.id).length >= 2 &&
    seeded.projectIds[project.id],
  );
  requireFixture(firstProject, "no project has two judges");
  const [judgeA, judgeB] = fixture.scores
    .filter((score) => score.project === firstProject.id)
    .slice(0, 2)
    .map((score) => score.judge);
  requireFixture(judgeA && judgeB, "no judge pair is available");
  const roles = [
    ["organizer", seeded.organizerId],
    ["judgeA", seeded.judgeIds[judgeA]],
    ["judgeB", seeded.judgeIds[judgeB]],
    ["participant", seeded.participantId],
  ] as const;
  console.log(`[db] official fixture seeded: ${JSON.stringify(seeded.counts)}; eventId=${seeded.eventId}; sharedProjectId=${seeded.projectIds[firstProject.id]}`);
  const localFixtureAuth = fixtureSeedingEnabled();
  const expiresAt = new Date(Date.now() + (localFixtureAuth ? 12 : 24 * 30) * 60 * 60 * 1000);
  for (const [role, userId] of roles) {
    requireFixture(userId, `missing ${role} user`);
    const token = fixtureSessionToken(role);
    await db.insert(schema.sessions).values({
      userId, tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt,
    }).onConflictDoUpdate({
      target: schema.sessions.tokenHash,
      set: { userId, expiresAt },
    });
    console.log(`[db] ${role} header: Cookie: dogfood_session=${token}`);
  }
}

export type { Fixture as OfficialFixture };
