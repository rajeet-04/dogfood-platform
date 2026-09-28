/**
 * Reproducible, database-free normalization demonstration over the official
 * fixture. The fixture format itself does not define a rubric, so this mirrors
 * the repository seeder's equal-weight rubric (0.33334, 0.33333, 0.33333).
 *
 * Run from the repository root: bun run scripts/judging-proof/official-fixture.ts
 */

import { readFile } from "node:fs/promises";

type Fixture = {
  projects: Array<{ id: string; team: string }>;
  scores: Array<{
    judge: string;
    project: string;
    criteria: Record<string, number>;
  }>;
};

const fixturePath = new URL("../../plans-dogfood/official/fixtures.json", import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture;
const minimumBatchSize = 2;
const weights = { functionality: 0.33334, quality: 0.33333, innovation: 0.33333 };

// Match seedOfficialFixture: only the first project per team is canonical;
// later same-team submissions and their scores remain import anomalies.
const seenTeams = new Set<string>();
const canonicalProjects = new Set<string>();
for (const project of fixture.projects) {
  if (!seenTeams.has(project.team)) {
    seenTeams.add(project.team);
    canonicalProjects.add(project.id);
  }
}

const batches = new Map<string, Array<{ projectId: string; score: number }>>();
let excludedAnomalyScores = 0;
for (const item of fixture.scores) {
  if (!canonicalProjects.has(item.project)) {
    excludedAnomalyScores += 1;
    continue;
  }
  const score = Object.entries(weights).reduce(
    (sum, [criterion, weight]) => sum + item.criteria[criterion] * weight,
    0,
  );
  const batch = batches.get(item.judge) ?? [];
  batch.push({ projectId: item.project, score });
  batches.set(item.judge, batch);
}

const belowMinimum: string[] = [];
const flat: string[] = [];
const normalized = new Map<string, Array<{ projectId: string; score: number }>>();
for (const [judgeId, batch] of batches) {
  if (batch.length < minimumBatchSize) {
    belowMinimum.push(judgeId);
    continue;
  }
  const mean = batch.reduce((sum, row) => sum + row.score, 0) / batch.length;
  const variance = batch.reduce((sum, row) => sum + (row.score - mean) ** 2, 0) / batch.length;
  const sigma = Math.sqrt(variance);
  if (sigma === 0) flat.push(judgeId);
  normalized.set(
    judgeId,
    batch.map((row) => ({
      projectId: row.projectId,
      score: sigma === 0 ? 0 : (row.score - mean) / sigma,
    })),
  );
}

function rank(useZScore: boolean) {
  const competitiveByProject = new Map<string, number[]>();
  const rawByProject = new Map<string, number[]>();
  for (const [judgeId, batch] of batches) {
    for (const row of batch) {
      const raw = rawByProject.get(row.projectId) ?? [];
      raw.push(row.score);
      rawByProject.set(row.projectId, raw);
    }
    if (batch.length < minimumBatchSize) continue;
    const values = useZScore ? normalized.get(judgeId)! : batch.map((row) => ({ ...row, score: row.score }));
    for (const row of values) {
      const scores = competitiveByProject.get(row.projectId) ?? [];
      scores.push(row.score);
      competitiveByProject.set(row.projectId, scores);
    }
  }
  const entries = [...competitiveByProject].map(([projectId, values]) => ({
    projectId,
    competitiveScore: values.reduce((sum, value) => sum + value, 0) / values.length,
    // Match ranking service: secondary score includes every submitted review,
    // including a judge batch excluded from primary-score aggregation.
    secondaryScore: (rawByProject.get(projectId) ?? []).reduce((sum, value) => sum + value, 0) /
      (rawByProject.get(projectId)?.length ?? 1),
  }));
  entries.sort((a, b) =>
    b.competitiveScore - a.competitiveScore ||
    b.secondaryScore - a.secondaryScore ||
    a.projectId.localeCompare(b.projectId),
  );
  const rankByProject = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (index === 0 || entry.competitiveScore !== entries[index - 1].competitiveScore) {
      rankByProject.set(entry.projectId, index + 1);
    } else {
      rankByProject.set(entry.projectId, rankByProject.get(entries[index - 1].projectId)!);
    }
  });
  return { entries, rankByProject };
}

const rawRank = rank(false);
const zRank = rank(true);
const movements = rawRank.entries.map(({ projectId }) => ({
  projectId,
  rawRank: rawRank.rankByProject.get(projectId)!,
  zScoreRank: zRank.rankByProject.get(projectId)!,
}));
const moved = movements.filter((row) => row.rawRank !== row.zScoreRank);
const maxMovement = Math.max(0, ...movements.map((row) => Math.abs(row.rawRank - row.zScoreRank)));

console.log(`Official fixture rows: ${fixture.projects.length} projects, ${fixture.scores.length} score records`);
console.log(`Canonical seed input: ${canonicalProjects.size} projects, ${fixture.scores.length - excludedAnomalyScores} scores; ${excludedAnomalyScores} anomalous duplicate-team score(s) excluded`);
console.log(`Judges with scores: ${batches.size}; min batch size: ${minimumBatchSize}; eligible: ${batches.size - belowMinimum.length}; below minimum: ${belowMinimum.length}; eligible flat: ${flat.length}`);
console.log(`Ranked projects: ${rawRank.entries.length}; projects whose competition rank changes (none -> z-score): ${moved.length}; largest absolute movement: ${maxMovement}`);
console.log(`Raw top 5: ${rawRank.entries.slice(0, 5).map((row) => `${row.projectId} (${rawRank.rankByProject.get(row.projectId)})`).join(", ")}`);
console.log(`Z-score top 5: ${zRank.entries.slice(0, 5).map((row) => `${row.projectId} (${zRank.rankByProject.get(row.projectId)})`).join(", ")}`);
console.log(`Movement sample: ${moved.slice(0, 8).map((row) => `${row.projectId} ${row.rawRank}->${row.zScoreRank}`).join(", ") || "none"}`);
