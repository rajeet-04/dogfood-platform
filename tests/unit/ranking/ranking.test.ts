import { describe, expect, it } from "vitest";

import { RANKING_VERSION, rankProjects } from "@dogfood/ranking";

function expectCode(fn: () => void, code: string): void {
  try {
    fn();
    expect.unreachable("expected the assertion to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe(code);
  }
}

const config = { tieBreakers: ["secondary-score", "project-id"] } as const;

describe("rankProjects", () => {
  it("orders projects by competitive score descending", () => {
    const result = rankProjects(
      [
        { projectId: "slow", competitiveScore: 40 },
        { projectId: "fast", competitiveScore: 80 },
        { projectId: "mid", competitiveScore: 60 },
      ],
      config,
    );

    expect(result.ranked.map((r) => r.projectId)).toEqual([
      "fast",
      "mid",
      "slow",
    ]);
    expect(result.ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("is deterministic across repeated runs", () => {
    const input = [
      { projectId: "slow", competitiveScore: 40 },
      { projectId: "fast", competitiveScore: 80 },
      { projectId: "mid", competitiveScore: 60 },
    ];
    const first = rankProjects(input, config);
    const second = rankProjects(input, config);

    expect(second).toEqual(first);
    expect(second.rankingVersion).toBe(RANKING_VERSION);
  });

  it("breaks competitive ties with the documented secondary criterion", () => {
    const result = rankProjects(
      [
        { projectId: "a", competitiveScore: 50, secondaryScore: 1 },
        { projectId: "b", competitiveScore: 50, secondaryScore: 9 },
      ],
      config,
    );

    expect(result.ranked[0].projectId).toBe("b");
    expect(result.ranked[1].projectId).toBe("a");
    expect(result.ranked[0].rank).toBe(1);
    expect(result.ranked[1].rank).toBe(1);
  });

  it("uses project id only as deterministic display ordering after competitive ties", () => {
    const result = rankProjects(
      [
        { projectId: "b-proj", competitiveScore: 50 },
        { projectId: "a-proj", competitiveScore: 50 },
      ],
      config,
    );

    expect(result.ranked[0].projectId).toBe("a-proj");
    expect(result.ranked[1].projectId).toBe("b-proj");
    expect(result.ranked[0].rank).toBe(1);
    expect(result.ranked[1].rank).toBe(1);
    expect(result.ranked[0].displayOrder).toBe(1);
    expect(result.ranked[1].displayOrder).toBe(2);
  });

  it("assigns competition-style ranks for a three-way gap", () => {
    const result = rankProjects(
      [
        { projectId: "p3", competitiveScore: 30 },
        { projectId: "p1", competitiveScore: 90 },
        { projectId: "p2", competitiveScore: 30 },
        { projectId: "p4", competitiveScore: 45 },
        { projectId: "p5", competitiveScore: 90 },
      ],
      config,
    );

    const byId = new Map(result.ranked.map((r) => [r.projectId, r]));
    expect(byId.get("p1")!.rank).toBe(1);
    expect(byId.get("p5")!.rank).toBe(1);
    expect(byId.get("p4")!.rank).toBe(3);
    expect(byId.get("p2")!.rank).toBe(4);
    expect(byId.get("p3")!.rank).toBe(4);
  });

  it("rejects empty tie breaker configuration", () => {
    expectCode(
      () => rankProjects([{ projectId: "a", competitiveScore: 10 }], {
        tieBreakers: [],
      }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects unknown tie breakers", () => {
    expectCode(
      () =>
        rankProjects([{ projectId: "a", competitiveScore: 10 }], {
          tieBreakers: ["bogus" as "project-id"],
        }),
      "VALIDATION_FAILED",
    );
  });

  it("rejects non-finite competitive scores", () => {
    expectCode(
      () =>
        rankProjects(
          [{ projectId: "a", competitiveScore: Number.NaN }],
          config,
        ),
      "INVALID_SCORE",
    );
  });
});