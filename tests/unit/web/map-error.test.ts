import { describe, expect, it } from "vitest";

import { mapError } from "../../../apps/web/server/errors/map-error";
import { DogfoodError } from "@dogfood/validation";

function wrapped(cause: Record<string, unknown>): Error {
  return Object.assign(new Error("Failed query: select ..."), {
    query: "select ... where id = $1",
    params: ["not-a-uuid"],
    cause,
  });
}

describe("mapError", () => {
  it("maps domain errors through the code table", () => {
    const { status, body } = mapError(
      new DogfoodError("NOT_FOUND", "Event not found"),
      "req-1",
    );
    expect(status).toBe(404);
    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
      message: "Event not found",
      requestId: "req-1",
    });
  });

  it("strips the domain error prefix from the message", () => {
    const { body } = mapError(
      new DogfoodError("EVENT_STATE_INVALID", "[EVENT_STATE_INVALID] Nope"),
      "req-1",
    );
    expect(body.error.message).toBe("Nope");
  });

  it("reports a unique-constraint violation as a conflict", () => {
    const { status, body } = mapError(
      wrapped({ code: "23505", message: "duplicate key" }),
      "req-1",
    );
    expect(status).toBe(409);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("treats a malformed id as not found instead of a server fault", () => {
    // Drizzle nests the SQLSTATE on `cause`; the value can never identify a row.
    const { status, body } = mapError(
      wrapped({ code: "22P02", message: "invalid input syntax for type uuid" }),
      "req-1",
    );
    expect(status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("never leaks the driver message for an unknown failure", () => {
    const { status, body } = mapError(new Error("ECONNREFUSED"), "req-1");
    expect(status).toBe(500);
    expect(body.error).toEqual({
      code: "INTERNAL",
      message: "Internal server error",
      requestId: "req-1",
    });
  });
});
