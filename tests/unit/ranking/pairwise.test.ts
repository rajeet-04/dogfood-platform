import { describe, expect, it } from "vitest";
import { rankPairwiseProjects } from "@dogfood/ranking";

describe("Bradley-Terry pairwise ranking", () => {
  it("recovers a deterministic global order from connected head-to-head results", () => {
    const comparisons = [
      { winnerProjectId: "alpha", loserProjectId: "beta" },
      { winnerProjectId: "alpha", loserProjectId: "beta" },
      { winnerProjectId: "beta", loserProjectId: "gamma" },
      { winnerProjectId: "alpha", loserProjectId: "gamma" },
      { winnerProjectId: "alpha", loserProjectId: "gamma" },
    ];
    const first = rankPairwiseProjects(["gamma", "beta", "alpha"], comparisons);
    const second = rankPairwiseProjects(["gamma", "beta", "alpha"], comparisons);
    expect(first.ranked.map(({ projectId }) => projectId)).toEqual(["alpha", "beta", "gamma"]);
    expect(first).toEqual(second);
    expect(first.converged).toBe(true);
    expect(first.ranked.reduce((sum, item) => sum + item.strength, 0)).toBeCloseTo(1);
  });

  it("uses lexical order only for equal estimated strengths", () => {
    const result = rankPairwiseProjects(["z", "a"], [
      { winnerProjectId: "z", loserProjectId: "a" },
      { winnerProjectId: "a", loserProjectId: "z" },
    ]);
    expect(result.ranked.map(({ projectId }) => projectId)).toEqual(["a", "z"]);
    expect(result.ranked[0].strength).toBeCloseTo(result.ranked[1].strength);
  });

  it("rejects self-comparisons, unknown projects and disconnected evidence", () => {
    expect(() => rankPairwiseProjects(["a", "b"], [])).toThrow(/comparison is required/i);
    expect(() => rankPairwiseProjects(["a", "b"], [{ winnerProjectId: "a", loserProjectId: "a" }])).toThrow(/distinct/i);
    expect(() => rankPairwiseProjects(["a", "b"], [{ winnerProjectId: "a", loserProjectId: "other" }])).toThrow(/distinct/i);
    expect(() => rankPairwiseProjects(["a", "b", "c"], [{ winnerProjectId: "a", loserProjectId: "b" }])).toThrow(/connect/i);
  });

  it("returns finite estimates when a project wins every observed comparison", () => {
    const result = rankPairwiseProjects(["a", "b"], [
      { winnerProjectId: "a", loserProjectId: "b" },
      { winnerProjectId: "a", loserProjectId: "b" },
    ]);
    expect(result.ranked[0].strength).toBeGreaterThan(result.ranked[1].strength);
    expect(result.ranked.every(({ strength }) => Number.isFinite(strength))).toBe(true);
  });
});
