import { describe, expect, it } from "vitest";

import {
  fixtureSeedingEnabled,
  fixtureSessionToken,
  type FixtureAuthRole,
} from "../../packages/db/src/fixture-seed";

const roles: FixtureAuthRole[] = ["organizer", "judgeA", "judgeB", "participant"];
const localFixtureEnv = {
  DOGFOOD_MODE: "local",
  DOGFOOD_SEED_FIXTURES: "1",
};

describe("local fixture authentication", () => {
  it("requires explicit local mode when fixture seeding is requested", () => {
    expect(fixtureSeedingEnabled({ DOGFOOD_SEED_FIXTURES: "0" })).toBe(false);
    expect(() => fixtureSeedingEnabled({ DOGFOOD_SEED_FIXTURES: "1" }))
      .toThrow("DOGFOOD_SEED_FIXTURES=1 requires DOGFOOD_MODE=local");
    expect(fixtureSeedingEnabled(localFixtureEnv)).toBe(true);
  });

  it("uses stable, distinct tokens only for local fixture seeding", () => {
    const first = roles.map((role) => fixtureSessionToken(role, localFixtureEnv));
    const second = roles.map((role) => fixtureSessionToken(role, localFixtureEnv));
    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(roles.length);

    const ordinary = roles.map((role) => fixtureSessionToken(role, {}));
    expect(ordinary.every((token) => token.length === 43)).toBe(true);
    expect(new Set(ordinary).size).toBe(roles.length);
    expect(ordinary).not.toEqual(first);
  });
});
