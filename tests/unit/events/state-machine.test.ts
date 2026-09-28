import { describe, expect, it } from "vitest";

import { assertEventTransition } from "@dogfood/events";

const VALID_SEQUENCE = [
  "DRAFT",
  "REGISTRATION",
  "SUBMISSIONS_OPEN",
  "SUBMISSIONS_CLOSED",
  "JUDGING",
  "RESULTS_READY",
  "PUBLISHED",
  "ARCHIVED",
] as const;

describe("event state machine", () => {
  it("accepts the documented lifecycle sequence", () => {
    for (let i = 0; i < VALID_SEQUENCE.length - 1; i++) {
      expect(() =>
        assertEventTransition(VALID_SEQUENCE[i], VALID_SEQUENCE[i + 1]),
      ).not.toThrow();
    }
  });

  it("rejects DRAFT -> JUDGING", () => {
    expect(() => assertEventTransition("DRAFT", "JUDGING")).toThrow(
      /EVENT_STATE_INVALID/,
    );
  });

  it("rejects backwards and unrelated transitions", () => {
    expect(() => assertEventTransition("PUBLISHED", "JUDGING")).toThrow(
      /EVENT_STATE_INVALID/,
    );
    expect(() => assertEventTransition("SUBMISSIONS_OPEN", "RESULTS_READY")).toThrow(
      /EVENT_STATE_INVALID/,
    );
  });

  it("allows same-state no-op transitions", () => {
    expect(() => assertEventTransition("DRAFT", "DRAFT")).not.toThrow();
  });

  it("allows unarchiving via the reverse edge", () => {
    expect(() => assertEventTransition("ARCHIVED", "PUBLISHED")).not.toThrow();
  });
});