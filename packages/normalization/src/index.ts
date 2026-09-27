import { DogfoodError } from "@dogfood/validation";

export type JudgeScore = {
  projectId: string;
  score: number;
};

export type NormalizationStrategy = "z-score" | "none";

export type NormalizationConfig = {
  strategy: NormalizationStrategy;
  minimumBatchSize: number;
};

export type NormalizedValue = {
  projectId: string;
  normalizedScore: number;
};

export type NormalizedBatch = {
  eligible: boolean;
  values: NormalizedValue[];
  diagnostics: string[];
};

export const BELOW_MINIMUM_BATCH = "BELOW_MINIMUM_BATCH";
export const ZERO_VARIANCE_BATCH = "ZERO_VARIANCE_BATCH";

export function normalizeJudgeBatch(
  scores: JudgeScore[],
  config: NormalizationConfig,
): NormalizedBatch {
  if (!Number.isFinite(config.minimumBatchSize) || config.minimumBatchSize < 1) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] minimumBatchSize must be at least 1",
    );
  }
  if (config.strategy !== "z-score" && config.strategy !== "none") {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Unsupported normalization strategy",
    );
  }

  for (const { projectId, score } of scores) {
    if (!Number.isFinite(score)) {
      throw new DogfoodError(
        "INVALID_SCORE",
        `[INVALID_SCORE] Score for project ${projectId} must be finite`,
      );
    }
  }

  if (scores.length < config.minimumBatchSize) {
    return {
      eligible: false,
      values: [],
      diagnostics: [BELOW_MINIMUM_BATCH],
    };
  }

  if (config.strategy === "none") {
    return {
      eligible: true,
      values: scores.map((s) => ({
        projectId: s.projectId,
        normalizedScore: s.score,
      })),
      diagnostics: [],
    };
  }

  const mean = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  const variance =
    scores.reduce((sum, s) => sum + (s.score - mean) ** 2, 0) / scores.length;
  const standardDeviation = Math.sqrt(variance);

  if (standardDeviation === 0) {
    return {
      eligible: true,
      values: scores.map((s) => ({
        projectId: s.projectId,
        normalizedScore: 0,
      })),
      diagnostics: [ZERO_VARIANCE_BATCH],
    };
  }

  return {
    eligible: true,
    values: scores.map((s) => ({
      projectId: s.projectId,
      normalizedScore: (s.score - mean) / standardDeviation,
    })),
    diagnostics: [],
  };
}