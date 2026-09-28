import { DogfoodError } from "@dogfood/validation";

export const RUBRIC_WEIGHT_TARGET = 100;

export type CriterionInput = {
  name: string;
  description?: string | null;
  weight: number;
  minScore: number;
  maxScore: number;
  optional?: boolean;
  sortOrder?: number | null;
};

export function assertCriterionInput(input: CriterionInput): void {
  if (!Number.isFinite(input.weight) || input.weight <= 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Criterion weight must be positive",
    );
  }
  if (!(input.maxScore > input.minScore)) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] maxScore must be greater than minScore",
    );
  }
}

export function assertRubricActivatable(weights: number[]): void {
  if (weights.length === 0) {
    throw new DogfoodError(
      "RUBRIC_INCOMPLETE",
      "[RUBRIC_INCOMPLETE] Rubric must have at least one criterion",
    );
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - RUBRIC_WEIGHT_TARGET) > 1e-9) {
    throw new DogfoodError(
      "RUBRIC_INCOMPLETE",
      `[RUBRIC_INCOMPLETE] Criterion weights must sum to ${RUBRIC_WEIGHT_TARGET}`,
    );
  }
}

export function toNumber(value: string | number): number {
  return typeof value === "number" ? value : Number.parseFloat(value);
}

export const EVALUATION_STATES = ["IN_PROGRESS", "SUBMITTED", "LOCKED"] as const;

export type EvaluationState = (typeof EVALUATION_STATES)[number];

const EVALUATION_TRANSITIONS: Record<EvaluationState, readonly EvaluationState[]> =
  {
    IN_PROGRESS: ["SUBMITTED"],
    SUBMITTED: ["LOCKED"],
    LOCKED: [],
  };

export function assertEvaluationTransition(
  from: EvaluationState,
  to: EvaluationState,
): void {
  if (from !== to && !EVALUATION_TRANSITIONS[from].includes(to)) {
    throw new DogfoodError(
      "EVALUATION_LOCKED",
      `[EVALUATION_LOCKED] Invalid evaluation transition ${from} -> ${to}`,
    );
  }
}

export type CriterionBounds = {
  criterionId: string;
  minScore: number;
  maxScore: number;
  optional?: boolean;
};

export type SubmittedCriterionScore = {
  criterionId: string;
  score: number;
  comment?: string | null;
};

export function validateSubmittedScores(
  criteria: CriterionBounds[],
  scores: SubmittedCriterionScore[],
): void {
  const seen = new Set<string>();
  for (const item of scores) {
    if (!Number.isFinite(item.score)) {
      throw new DogfoodError(
        "INVALID_SCORE",
        "[INVALID_SCORE] Score must be a finite number",
      );
    }
    if (seen.has(item.criterionId)) {
      throw new DogfoodError(
        "VALIDATION_FAILED",
        "[VALIDATION_FAILED] Duplicate criterion score",
      );
    }
    seen.add(item.criterionId);
    const criterion = criteria.find(
      (c) => c.criterionId === item.criterionId,
    );
    if (!criterion) {
      throw new DogfoodError(
        "VALIDATION_FAILED",
        "[VALIDATION_FAILED] Score for unknown criterion",
      );
    }
    if (item.score < criterion.minScore || item.score > criterion.maxScore) {
      throw new DogfoodError(
        "INVALID_SCORE",
        `[INVALID_SCORE] Score ${item.score} outside ${criterion.minScore}..${criterion.maxScore}`,
      );
    }
  }
  const missing = criteria.filter(
    (c) => !seen.has(c.criterionId) && !c.optional,
  );
  if (missing.length > 0) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Missing required criterion scores",
    );
  }
}