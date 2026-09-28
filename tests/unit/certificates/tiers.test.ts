import { describe, expect, it } from "vitest";

import {
  CERTIFICATE_TIER_LABEL,
  RUNNER_UP_MAX_RANK,
  WINNER_MAX_RANK,
  tierForRank,
} from "@dogfood/certificates";

describe("certificate tiers", () => {
  it("ranks are bounded to the winner and runner-up thresholds", () => {
    expect(WINNER_MAX_RANK).toBe(1);
    expect(RUNNER_UP_MAX_RANK).toBe(3);
  });

  it("maps rank 1 to winner", () => {
    expect(tierForRank(1)).toBe("winner");
  });

  it("maps ranks 2 and 3 to runner-up", () => {
    expect(tierForRank(2)).toBe("runner_up");
    expect(tierForRank(3)).toBe("runner_up");
  });

  it("maps lower ranks and missing ranks to participation", () => {
    expect(tierForRank(4)).toBe("participation");
    expect(tierForRank(50)).toBe("participation");
    expect(tierForRank(null)).toBe("participation");
    expect(tierForRank(undefined)).toBe("participation");
  });

  it("labels every tier", () => {
    expect(CERTIFICATE_TIER_LABEL.winner).toBe("Winner");
    expect(CERTIFICATE_TIER_LABEL.runner_up).toBe("Runner-up");
    expect(CERTIFICATE_TIER_LABEL.participation).toBe("Participation");
  });
});