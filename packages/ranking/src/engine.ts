import { DogfoodError } from "@dogfood/validation";

export type RankableProject = {
  projectId: string;
  competitiveScore: number;
  secondaryScore?: number;
};

export type TieBreaker = "secondary-score" | "project-id";

export type RankedProject = {
  projectId: string;
  competitiveScore: number;
  rank: number;
  displayOrder: number;
};

export type RankingConfig = {
  tieBreakers: Array<TieBreaker>;
};

export type RankingResult = {
  ranked: RankedProject[];
  rankingVersion: string;
};

export const RANKING_VERSION = "1.0";

function compareCompetitive(
  a: RankableProject,
  b: RankableProject,
): number {
  if (a.competitiveScore !== b.competitiveScore) {
    return b.competitiveScore - a.competitiveScore;
  }
  return 0;
}

function compareSecondary(a: RankableProject, b: RankableProject): number {
  const ai = a.secondaryScore ?? 0;
  const bi = b.secondaryScore ?? 0;
  return bi - ai;
}

/**
 * Deterministic ordering with documented tie policy. Project ID is used only
 * as deterministic display ordering, never as a meaningful competitive tiebreak.
 */
export function rankProjects(
  input: RankableProject[],
  config: RankingConfig,
): RankingResult {
  if (!Array.isArray(config.tieBreakers) || config.tieBreakers.length === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] At least one tie breaker is required",
    );
  }
  const validTieBreakers: TieBreaker[] = ["secondary-score", "project-id"];
  for (const breaker of config.tieBreakers) {
    if (!validTieBreakers.includes(breaker)) {
      throw new DogfoodError(
        "VALIDATION_FAILED",
        `[VALIDATION_FAILED] Unknown tie breaker ${breaker}`,
      );
    }
  }
  for (const { projectId, competitiveScore } of input) {
    if (!Number.isFinite(competitiveScore)) {
      throw new DogfoodError(
        "INVALID_SCORE",
        `[INVALID_SCORE] Competitive score for project ${projectId} must be finite`,
      );
    }
  }

  const entries = [...input];
  entries.sort((a, b) => {
    const primary = compareCompetitive(a, b);
    if (primary !== 0) return primary;
    if (config.tieBreakers.includes("secondary-score")) {
      const secondary = compareSecondary(a, b);
      if (secondary !== 0) return secondary;
    }
    return a.projectId.localeCompare(b.projectId);
  });

  const ranked: RankedProject[] = [];
  let index = 0;
  while (index < entries.length) {
    const score = entries[index].competitiveScore;
    const start = index;
    while (
      index < entries.length &&
      entries[index].competitiveScore === score
    ) {
      index += 1;
    }
    for (let k = start; k < index; k += 1) {
      ranked.push({
        projectId: entries[k].projectId,
        competitiveScore: score,
        rank: start + 1,
        displayOrder: k + 1,
      });
    }
  }

  return { ranked, rankingVersion: RANKING_VERSION };
}