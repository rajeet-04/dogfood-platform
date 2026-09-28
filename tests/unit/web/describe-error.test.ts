import { describe, expect, it } from "vitest";

import { describeError } from "../../../apps/web/server/actions/common";
import { DogfoodError } from "@dogfood/validation";

describe("describeError", () => {
  it("passes through DogfoodError messages", () => {
    expect(describeError(new DogfoodError("NOT_FOUND", "Event not found"))).toBe(
      "Event not found",
    );
  });

  it("maps a unique-constraint violation to a friendly message", () => {
    const err = Object.assign(new Error("Failed query: insert ..."), {
      query: "insert into events ...",
      params: ["port-mortem", "UTC"],
      cause: {
        code: "23505",
        message:
          'duplicate key value violates unique constraint "events_slug_unique"',
      },
    });
    expect(describeError(err)).toBe(
      "That value is already in use. Please choose a different one.",
    );
  });

  it("maps a foreign-key violation to a friendly message", () => {
    const err = Object.assign(new Error("Failed query: ..."), {
      query: "insert ...",
      params: [],
      cause: { code: "23503", message: "violates foreign key constraint" },
    });
    expect(describeError(err)).toBe(
      "A related record no longer exists. Refresh and try again.",
    );
  });

  it("never leaks a raw driver error blob", () => {
    const err = Object.assign(new Error("Failed query: delete ..."), {
      query: "delete from events ...",
      params: ["secret"],
    });
    expect(describeError(err)).toBe("Something went wrong.");
  });

  it("passes through plain errors", () => {
    expect(describeError(new Error("Compute failed"))).toBe("Compute failed");
  });

  it("falls back for unknown non-errors", () => {
    expect(describeError(undefined)).toBe("Something went wrong.");
  });
});