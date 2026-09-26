// Pure judge normalization engine. No framework or database imports.

export type JudgeScore = {
  projectId: string;
  score: number;
};

export type NormalizationConfig = {
  strategy: "z-score" | "none";
  minimumBatchSize: number;
};

export type NormalizedBatch = {
  eligible: boolean;
  values: Array<{ projectId: string; normalizedScore: number }>;
  diagnostics: string[];
};

export const NORMALIZATION_VERSION = "1.0";

export const ZERO_VARIANCE_BATCH = "ZERO_VARIANCE_BATCH";
export const BATCH_BELOW_MINIMUM = "BATCH_BELOW_MINIMUM";

/**
 * Per-judge z-score: z_ij = (x_ij - μ_j) / σ_j.
 *
 * Rules:
 * - Zero variance yields neutral normalized contribution + ZERO_VARIANCE_BATCH.
 * - Batches smaller than minimumBatchSize are normalization-ineligible.
 * - Missing evaluations are missing data, never implicit zero.
 */
export function normalizeJudgeBatch(
  _scores: JudgeScore[],
  _config: NormalizationConfig,
): NormalizedBatch {
  throw new Error("normalizeJudgeBatch not implemented");
}