import { describe, expect, it } from "vitest";

import { ERROR_CODES, type ErrorCode } from "@dogfood/validation";

describe("scaffold smoke", () => {
  it("resolves the validation workspace package and error catalog", () => {
    const codes = ERROR_CODES as readonly ErrorCode[];
    expect(codes).toContain("FORBIDDEN");
  });
});