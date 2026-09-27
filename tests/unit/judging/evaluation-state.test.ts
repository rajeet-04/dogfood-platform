import { describe, expect, it } from "vitest";

import {
  assertEvaluationTransition,
  validateSubmittedScores,
} from "@dogfood/judging";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable("expected the assertion to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

const criteria = [
  { criterionId: "c1", minScore: 0, maxScore: 10 },
  { criterionId: "c2", minScore: 0, maxScore: 5 },
];

const validScores = [
  { criterionId: "c1", score: 8 },
  { criterionId: "c2", score: 4 },
];

describe("evaluation state transitions", () => {
  it("accepts IN_PROGRESS -> SUBMITTED -> LOCKED", () => {
    expect(() =>
      assertEvaluationTransition("IN_PROGRESS", "SUBMITTED"),
    ).not.toThrow();
    expect(() =>
      assertEvaluationTransition("SUBMITTED", "LOCKED"),
    ).not.toThrow();
  });

  it("rejects IN_PROGRESS -> LOCKED (lock requires a prior submit)", () => {
    expectCode(
      () => assertEvaluationTransition("IN_PROGRESS", "LOCKED"),
      "EVALUATION_LOCKED",
    );
  });

  it("rejects any transition out of LOCKED", () => {
    expectCode(
      () => assertEvaluationTransition("LOCKED", "IN_PROGRESS"),
      "EVALUATION_LOCKED",
    );
    expectCode(
      () => assertEvaluationTransition("LOCKED", "SUBMITTED"),
      "EVALUATION_LOCKED",
    );
  });

  it("rejects SUBMITTED -> IN_PROGRESS through the transition validator", () => {
    expectCode(
      () => assertEvaluationTransition("SUBMITTED", "IN_PROGRESS"),
      "EVALUATION_LOCKED",
    );
  });
});

describe("evaluation score validation", () => {
  it("accepts complete in-range scores", () => {
    expect(() => validateSubmittedScores(criteria, validScores)).not.toThrow();
  });

  it("rejects a score below the criterion minimum with INVALID_SCORE", () => {
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "c1", score: -1 }, { criterionId: "c2", score: 4 }]),
      "INVALID_SCORE",
    );
  });

  it("rejects a score above the criterion maximum with INVALID_SCORE", () => {
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "c1", score: 11 }, { criterionId: "c2", score: 4 }]),
      "INVALID_SCORE",
    );
  });

  it("rejects non-finite scores with INVALID_SCORE", () => {
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "c1", score: Number.NaN }, { criterionId: "c2", score: 4 }]),
      "INVALID_SCORE",
    );
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "c1", score: Number.POSITIVE_INFINITY }, { criterionId: "c2", score: 4 }]),
      "INVALID_SCORE",
    );
  });

  it("rejects missing required criteria with VALIDATION_FAILED", () => {
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "c1", score: 8 }]),
      "VALIDATION_FAILED",
    );
  });

  it("rejects duplicate criterion scores with VALIDATION_FAILED", () => {
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "c1", score: 8 }, { criterionId: "c1", score: 9 }, { criterionId: "c2", score: 4 }]),
      "VALIDATION_FAILED",
    );
  });

  it("rejects scores for an unknown criterion with VALIDATION_FAILED", () => {
    expectCode(
      () => validateSubmittedScores(criteria, [{ criterionId: "nope", score: 8 }, { criterionId: "c2", score: 4 }]),
      "VALIDATION_FAILED",
    );
  });
});