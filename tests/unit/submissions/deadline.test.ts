import { describe, expect, it } from "vitest";

import { assertSubmissionWindow } from "@dogfood/submissions";

function expectDeadlinePassed(fn: () => void): void {
  try {
    fn();
    expect.unreachable("expected the window check to throw");
  } catch (error) {
    expect((error as { code?: string }).code).toBe("DEADLINE_PASSED");
  }
}

describe("submission window", () => {
  const base = {
    state: "SUBMISSIONS_OPEN",
    submissionOpensAt: null,
    submissionClosesAt: null,
  } as const;

  it("accepts writes strictly before the closing deadline", () => {
    const closesAt = new Date("2026-09-21T12:00:00.000Z");
    expect(() =>
      assertSubmissionWindow(
        new Date("2026-09-21T11:59:59.999Z"),
        { ...base, submissionClosesAt: closesAt },
      ),
    ).not.toThrow();
  });

  it("rejects writes exactly at the closing deadline", () => {
    const closesAt = new Date("2026-09-21T12:00:00.000Z");
    expectDeadlinePassed(() =>
      assertSubmissionWindow(new Date("2026-09-21T12:00:00.000Z"), {
        ...base,
        submissionClosesAt: closesAt,
      }),
    );
  });

  it("rejects writes after the closing deadline", () => {
    const closesAt = new Date("2026-09-21T12:00:00.000Z");
    expectDeadlinePassed(() =>
      assertSubmissionWindow(new Date("2026-09-21T12:00:00.001Z"), {
        ...base,
        submissionClosesAt: closesAt,
      }),
    );
  });

  it("rejects writes before the opening time", () => {
    const opensAt = new Date("2026-09-21T12:00:00.000Z");
    expectDeadlinePassed(() =>
      assertSubmissionWindow(new Date("2026-09-21T11:59:59.999Z"), {
        ...base,
        submissionOpensAt: opensAt,
      }),
    );
  });

  it("rejects writes when the event is not in the submission window state", () => {
    expectDeadlinePassed(() =>
      assertSubmissionWindow(new Date("2026-09-21T11:00:00.000Z"), {
        ...base,
        state: "REGISTRATION",
      }),
    );
  });
});