import { describe, expect, it } from "vitest";

import {
  RUBRIC_WEIGHT_TARGET,
  assertCriterionInput,
  assertRubricActivatable,
} from "@dogfood/judging";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable("expected the assertion to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

const validCriterion = {
  name: "Novelty",
  weight: 50,
  minScore: 0,
  maxScore: 10,
};

describe("rubric invariants", () => {
  it("rejects non-positive weights", () => {
    expectCode(() => assertCriterionInput({ ...validCriterion, weight: 0 }), "VALIDATION_FAILED");
    expectCode(() => assertCriterionInput({ ...validCriterion, weight: -1 }), "VALIDATION_FAILED");
    expectCode(() => assertCriterionInput({ ...validCriterion, weight: Number.NaN }), "VALIDATION_FAILED");
  });

  it("rejects maxScore less than or equal to minScore", () => {
    expectCode(
      () => assertCriterionInput({ ...validCriterion, maxScore: 0, minScore: 0 }),
      "VALIDATION_FAILED",
    );
    expectCode(
      () => assertCriterionInput({ ...validCriterion, maxScore: 5, minScore: 10 }),
      "VALIDATION_FAILED",
    );
  });

  it("accepts a valid criterion", () => {
    expect(() => assertCriterionInput(validCriterion)).not.toThrow();
  });

  it("rejects activation when total weight differs from the target", () => {
    expectCode(() => assertRubricActivatable([40, 40]), "RUBRIC_INCOMPLETE");
    expectCode(
      () => assertRubricActivatable([10, 10, 10, 10]),
      "RUBRIC_INCOMPLETE",
    );
  });

  it("rejects activation of an empty rubric", () => {
    expectCode(() => assertRubricActivatable([]), "RUBRIC_INCOMPLETE");
  });

  it("accepts activation when weights sum to the target", () => {
    expect(() =>
      assertRubricActivatable([
        RUBRIC_WEIGHT_TARGET * 0.4,
        RUBRIC_WEIGHT_TARGET * 0.6,
      ]),
    ).not.toThrow();
  });
});