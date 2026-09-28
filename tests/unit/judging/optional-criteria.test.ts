import { describe, expect, it } from "vitest";

import { validateSubmittedScores } from "@dogfood/judging";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable("expected the assertion to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

describe("validateSubmittedScores", () => {
  const bounds = [
    { criterionId: "req", minScore: 0, maxScore: 10 },
    { criterionId: "opt", minScore: 0, maxScore: 10, optional: true },
  ];

  it("allows skipping an optional criterion", () => {
    expect(() =>
      validateSubmittedScores(bounds, [
        { criterionId: "req", score: 7 },
      ]),
    ).not.toThrow();
  });

  it("still requires every required criterion", () => {
    expectCode(
      () =>
        validateSubmittedScores(bounds, [
          { criterionId: "opt", score: 7 },
        ]),
      "VALIDATION_FAILED",
    );
  });

  it("rejects all-optional evaluation with no required criterion", () => {
    expect(() =>
      validateSubmittedScores(
        [{ criterionId: "opt", minScore: 0, maxScore: 10, optional: true }],
        [],
      ),
    ).not.toThrow();
  });
});