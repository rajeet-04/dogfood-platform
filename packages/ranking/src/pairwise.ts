import { DogfoodError } from "@dogfood/validation";

/** A judge's selection from a head-to-head project comparison. */
export type PairwiseComparison = {
  winnerProjectId: string;
  loserProjectId: string;
};

export type PairwiseRankedProject = {
  projectId: string;
  /** Relative Bradley-Terry strength, normalized to sum to one. */
  strength: number;
  rank: number;
};

export type PairwiseRanking = {
  algorithm: "bradley-terry-mm-v1";
  iterations: number;
  converged: boolean;
  ranked: PairwiseRankedProject[];
};

export type PairwiseRankingOptions = {
  maxIterations?: number;
  tolerance?: number;
  /** Symmetric pseudo-wins per side of an observed matchup. */
  priorWins?: number;
};

/**
 * Estimate relative project strength from head-to-head wins with a
 * Bradley-Terry model, using a deterministic MM iteration. A half-win prior
 * on each side of an observed matchup prevents infinite estimates when a
 * project wins every comparison. This ranks only components connected by
 * observed comparisons: disconnected inputs are rejected because their
 * cross-component ordering is unsupported by evidence.
 */
export function rankPairwiseProjects(
  projectIds: string[],
  comparisons: PairwiseComparison[],
  options: PairwiseRankingOptions = {},
): PairwiseRanking {
  const maxIterations = options.maxIterations ?? 10_000;
  const tolerance = options.tolerance ?? 1e-10;
  const priorWins = options.priorWins ?? 0.5;

  if (projectIds.length < 2 || new Set(projectIds).size !== projectIds.length || projectIds.some((id) => !id.trim())) {
    throw new DogfoodError("VALIDATION_FAILED", "Provide at least two unique, non-empty project IDs");
  }
  if (comparisons.length === 0) {
    throw new DogfoodError("VALIDATION_FAILED", "At least one pairwise comparison is required");
  }
  if (!Number.isInteger(maxIterations) || maxIterations < 1 || !Number.isFinite(tolerance) || tolerance <= 0 || !Number.isFinite(priorWins) || priorWins <= 0) {
    throw new DogfoodError("VALIDATION_FAILED", "Pairwise ranking options must be finite and positive");
  }

  const indexById = new Map(projectIds.map((id, index) => [id, index]));
  const wins = projectIds.map(() => projectIds.map(() => 0));
  const counts = projectIds.map(() => projectIds.map(() => 0));
  for (const comparison of comparisons) {
    const winner = indexById.get(comparison.winnerProjectId);
    const loser = indexById.get(comparison.loserProjectId);
    if (winner === undefined || loser === undefined || winner === loser) {
      throw new DogfoodError("VALIDATION_FAILED", "Each comparison must select two distinct listed projects");
    }
    wins[winner][loser] += 1;
    counts[winner][loser] += 1;
    counts[loser][winner] += 1;
  }

  // A common scale is not identifiable across disconnected comparison graphs.
  const reached = new Set<number>([0]);
  const queue = [0];
  while (queue.length) {
    const current = queue.shift()!;
    for (let other = 0; other < projectIds.length; other += 1) {
      if (counts[current][other] > 0 && !reached.has(other)) {
        reached.add(other);
        queue.push(other);
      }
    }
  }
  if (reached.size !== projectIds.length) {
    throw new DogfoodError("VALIDATION_FAILED", "Comparisons must connect every listed project");
  }

  let strengths = projectIds.map(() => 1);
  let iterations = 0;
  let converged = false;
  for (; iterations < maxIterations; iterations += 1) {
    const next = strengths.map((_, i) => {
      let observedWins = 0;
      let expectedExposure = 0;
      for (let j = 0; j < projectIds.length; j += 1) {
        if (i === j || counts[i][j] === 0) continue;
        observedWins += wins[i][j] + priorWins;
        const matchupCount = counts[i][j] + 2 * priorWins;
        expectedExposure += matchupCount / (strengths[i] + strengths[j]);
      }
      return observedWins / expectedExposure;
    });
    const scale = next.reduce((sum, strength) => sum + strength, 0);
    const normalized = next.map((strength) => strength / scale);
    const delta = Math.max(...normalized.map((strength, i) => Math.abs(strength - strengths[i] / strengths.reduce((sum, item) => sum + item, 0))));
    strengths = normalized;
    if (delta <= tolerance) {
      iterations += 1;
      converged = true;
      break;
    }
  }

  const ranked = projectIds
    .map((projectId, index) => ({ projectId, strength: strengths[index] }))
    .sort((a, b) => b.strength - a.strength || a.projectId.localeCompare(b.projectId))
    .map((item, index) => ({ ...item, rank: index + 1 }));
  return { algorithm: "bradley-terry-mm-v1", iterations, converged, ranked };
}
