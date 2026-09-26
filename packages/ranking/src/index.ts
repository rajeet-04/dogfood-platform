// Pure deterministic ranking engine. No framework or database imports.

export type RankedProject = {
  projectId: string;
  competitiveScore: number;
  displayOrder: number;
};

export type RankingConfig = {
  tieBreakers: Array<"secondary-score" | "project-id">;
};

export type RankingResult = {
  ranked: RankedProject[];
  rankingVersion: string;
};

export const RANKING_VERSION = "1.0";

/**
 * Deterministic ordering with documented tie policy. Project ID is used only
 * as deterministic display ordering, never as a meaningful competitive tiebreak.
 */
export function rankProjects(
  _input: unknown,
  _config: RankingConfig,
): RankingResult {
  throw new Error("rankProjects not implemented");
}