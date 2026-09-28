import { db, eq, schema } from "@dogfood/db";
import { registerUser } from "@dogfood/auth";
import { createEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let counter = 0;

describe("event creation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function scenario() {
    counter += 1;
    const user = await registerUser({
      email: `create-${counter}@example.com`,
      password: "pass",
      displayName: "User",
    });
    return { user };
  }

  it("rejects a duplicate slug", async () => {
    const { user } = await scenario();
    await createEvent(actorFor(user.id), {
      slug: "same-slug",
      name: "First",
      timezone: "UTC",
    });
    await expect(
      createEvent(actorFor(user.id), {
        slug: "same-slug",
        name: "Second",
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" });
  });

  it("tolerates empty-string window boundaries as null", async () => {
    const { user } = await scenario();
    const empty = "" as unknown as Date;
    const event = await createEvent(actorFor(user.id), {
      slug: "empty-windows",
      name: "Empty Windows",
      timezone: "UTC",
      registrationOpensAt: empty,
      registrationClosesAt: empty,
      submissionOpensAt: empty,
      submissionClosesAt: empty,
      judgingOpensAt: empty,
      judgingClosesAt: empty,
    });

    const rows = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, event.id));
    expect(rows[0].registrationOpensAt).toBeNull();
    expect(rows[0].registrationClosesAt).toBeNull();
    expect(rows[0].submissionOpensAt).toBeNull();
    expect(rows[0].submissionClosesAt).toBeNull();
    expect(rows[0].judgingOpensAt).toBeNull();
    expect(rows[0].judgingClosesAt).toBeNull();
  });
});