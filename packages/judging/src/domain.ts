import { DogfoodError } from "@dogfood/validation";

export const RUBRIC_WEIGHT_TARGET = 100;

export type CriterionInput = {
  name: string;
  description?: string | null;
  weight: number;
  minScore: number;
  maxScore: number;
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