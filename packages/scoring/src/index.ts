import { DogfoodError } from "@dogfood/validation";

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

export function calculateWeightedScore(
  scores: CriterionScore[],
): WeightedScoreResult {
  if (scores.length === 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] At least one criterion score is required",
    );
  }

  for (const { criterionId, score, weight } of scores) {
    if (!Number.isFinite(score)) {
      throw new DogfoodError(
        "INVALID_SCORE",
        `[INVALID_SCORE] Score for criterion ${criterionId} must be finite`,
      );
    }
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new DogfoodError(
        "VALIDATION_FAILED",
        `[VALIDATION_FAILED] Weight for criterion ${criterionId} must be positive`,
      );
    }
  }

  const contributions = scores.map(({ criterionId, score, weight }) => ({
    criterionId,
    weightedScore: score * weight,
  }));
  const total = contributions.reduce((sum, c) => sum + c.weightedScore, 0);

  return { total, contributions };
}