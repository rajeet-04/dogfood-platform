import { describe, expect, it } from "vitest";

import {
  BELOW_MINIMUM_BATCH,
  ZERO_VARIANCE_BATCH,
  normalizeJudgeBatch,
} from "@dogfood/normalization";
import {
  lenientJudgeBatch,
  partialBatch,
  strictJudgeBatch,
  zeroVarianceBatch,
} from "../../fixtures/judging";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable("expected the assertion to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

describe("normalizeJudgeBatch", () => {
  it("mean-centered z-scores for an ordinary batch", () => {
    const result = normalizeJudgeBatch(strictJudgeBatch, {
      strategy: "z-score",
      minimumBatchSize: 3,
    });

    expect(result.eligible).toBe(true);
    const values = [...result.values].sort((a, b) =>
      a.projectId.localeCompare(b.projectId),
    );
    expect(values).toHaveLength(3);
    for (const v of result.values) {
      expect(Number.isFinite(v.normalizedScore)).toBe(true);
    }
    const mean = result.values.reduce((s, v) => s + v.normalizedScore, 0) / 3;
    expect(mean).toBeCloseTo(0, 10);
  });

  it("matches hand-calculated z-scores", () => {
    const result = normalizeJudgeBatch(
      [
        { projectId: "a", score: 10 },
        { projectId: "b", score: 20 },
        { projectId: "c", score: 30 },
      ],
      { strategy: "z-score", minimumBatchSize: 3 },
    );

    const byId = new Map(
      result.values.map((v) => [v.projectId, v.normalizedScore]),
    );
    expect(byId.get("a")).toBeCloseTo(-1.224744871, 6);
    expect(byId.get("b")).toBeCloseTo(0, 6);
    expect(byId.get("c")).toBeCloseTo(1.224744871, 6);
  });

  it("handles zero variance without dividing by zero", () => {
    const result = normalizeJudgeBatch(zeroVarianceBatch, {
      strategy: "z-score",
      minimumBatchSize: 4,
    });

    expect(result.eligible).toBe(true);
    expect(result.values).toHaveLength(4);
    for (const v of result.values) {
      expect(v.normalizedScore).toBe(0);
      expect(Number.isFinite(v.normalizedScore)).toBe(true);
    }
    expect(result.diagnostics).toContain(ZERO_VARIANCE_BATCH);
  });

  it("marks a batch smaller than the minimum as ineligible", () => {
    const result = normalizeJudgeBatch(partialBatch, {
      strategy: "z-score",
      minimumBatchSize: 5,
    });

    expect(result.eligible).toBe(false);
    expect(result.values).toEqual([]);
    expect(result.diagnostics).toContain(BELOW_MINIMUM_BATCH);
  });

  it("returns raw scores for the none strategy", () => {
    const result = normalizeJudgeBatch(lenientJudgeBatch, {
      strategy: "none",
      minimumBatchSize: 1,
    });

    expect(result.eligible).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.values).toEqual(
      lenientJudgeBatch.map((s) => ({
        projectId: s.projectId,
        normalizedScore: s.score,
      })),
    );
  });

  it("keeps missing projects absent instead of synthesizing zero", () => {
    const result = normalizeJudgeBatch(partialBatch, {
      strategy: "z-score",
      minimumBatchSize: 2,
    });

    const present = result.values.map((v) => v.projectId);
    expect(present).toEqual(["proj-a", "proj-b"]);
    expect(present).not.toContain("proj-c");
  });

  it("is deterministic across repeated runs", () => {
    const config = { strategy: "z-score" as const, minimumBatchSize: 3 };
    const first = normalizeJudgeBatch(strictJudgeBatch, config);
    const second = normalizeJudgeBatch(strictJudgeBatch, config);

    expect(second).toEqual(first);
  });

  it("rejects non-finite scores", () => {
    expectCode(
      () =>
        normalizeJudgeBatch(
          [
            { projectId: "a", score: Number.NaN },
            { projectId: "b", score: 7 },
          ],
          { strategy: "z-score", minimumBatchSize: 2 },
        ),
      "INVALID_SCORE",
    );
  });

  it("rejects an invalid minimum batch size", () => {
    expectCode(
      () =>
        normalizeJudgeBatch(strictJudgeBatch, {
          strategy: "z-score",
          minimumBatchSize: 0,
        }),
      "VALIDATION_FAILED",
    );
  });
});