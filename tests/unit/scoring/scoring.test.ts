import { describe, expect, it } from "vitest";

import { calculateWeightedScore } from "@dogfood/scoring";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable("expected the assertion to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

describe("calculateWeightedScore", () => {
  it("matches hand-calculated weighted contributions", () => {
    const result = calculateWeightedScore([
      { criterionId: "novelty", score: 8, weight: 40 },
      { criterionId: "execution", score: 4, weight: 60 },
    ]);

    expect(result.contributions).toEqual([
      { criterionId: "novelty", weightedScore: 320 },
      { criterionId: "execution", weightedScore: 240 },
    ]);
    expect(result.total).toBe(560);
  });

  it("handles fractional weights", () => {
    const result = calculateWeightedScore([
      { criterionId: "novelty", score: 8, weight: 0.4 },
      { criterionId: "execution", score: 4, weight: 0.6 },
    ]);

    expect(result.total).toBeCloseTo(5.6, 10);
    expect(result.contributions[0].weightedScore).toBeCloseTo(3.2, 10);
    expect(result.contributions[1].weightedScore).toBeCloseTo(2.4, 10);
  });

  it("returns zero total for all-zero scores", () => {
    const result = calculateWeightedScore([
      { criterionId: "novelty", score: 0, weight: 40 },
      { criterionId: "execution", score: 0, weight: 60 },
    ]);

    expect(result.total).toBe(0);
    expect(result.contributions.every((c) => c.weightedScore === 0)).toBe(true);
  });

  it("rejects an empty list", () => {
    expectCode(() => calculateWeightedScore([]), "VALIDATION_FAILED");
  });

  it("rejects non-finite scores", () => {
    expectCode(
      () =>
        calculateWeightedScore([
          { criterionId: "a", score: Number.NaN, weight: 40 },
        ]),
      "INVALID_SCORE",
    );
    expectCode(
      () =>
        calculateWeightedScore([
          { criterionId: "a", score: Number.POSITIVE_INFINITY, weight: 40 },
        ]),
      "INVALID_SCORE",
    );
  });

  it("rejects non-positive or non-finite weights", () => {
    expectCode(
      () =>
        calculateWeightedScore([
          { criterionId: "a", score: 5, weight: 0 },
        ]),
      "VALIDATION_FAILED",
    );
    expectCode(
      () =>
        calculateWeightedScore([
          { criterionId: "a", score: 5, weight: -10 },
        ]),
      "VALIDATION_FAILED",
    );
    expectCode(
      () =>
        calculateWeightedScore([
          { criterionId: "a", score: 5, weight: Number.NaN },
        ]),
      "VALIDATION_FAILED",
    );
  });

  it("preserves contribution order", () => {
    const result = calculateWeightedScore([
      { criterionId: "first", score: 1, weight: 1 },
      { criterionId: "second", score: 2, weight: 1 },
      { criterionId: "third", score: 3, weight: 1 },
    ]);

    expect(result.contributions.map((c) => c.criterionId)).toEqual([
      "first",
      "second",
      "third",
    ]);
  });
});