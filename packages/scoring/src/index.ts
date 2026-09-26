// Pure weighted scoring engine. No framework or database imports.

export type CriterionScore = {
  criterionId: string;
  score: number;
  weight: number;
};

export type WeightedScoreResult = {
  total: number;
  contributions: Array<{
    criterionId: string;
    weightedScore: number;
  }>;
};

export const SCORING_VERSION = "1.0";

/**
 * S_i = Σ(w_k × x_ik)
 */
export function calculateWeightedScore(
  _scores: CriterionScore[],
): WeightedScoreResult {
  throw new Error("calculateWeightedScore not implemented");
}