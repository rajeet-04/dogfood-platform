import { db, eq, schema } from "@dogfood/db";
import { registerUser } from "@dogfood/auth";
import { createEvent, transitionEvent } from "@dogfood/events";
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
    const other = await registerUser({
      email: `create-other-${counter}@example.com`,
      password: "pass",
      displayName: "Other",
    });
    return { user, other };
  }

  async function archive(slug: string, name: string, actor: Actor) {
    const event = await createEvent(actor, { slug, name, timezone: "UTC" });
    for (const state of [
      "REGISTRATION",
      "SUBMISSIONS_OPEN",
      "SUBMISSIONS_CLOSED",
      "JUDGING",
      "RESULTS_READY",
      "PUBLISHED",
      "ARCHIVED",
    ]) {
      await transitionEvent(actor, event.id, state as never);
    }
    return event;
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

  it("tells the owner to unarchive when the slug belongs to their archived event", async () => {
    const { user } = await scenario();
    await archive("my-archived", "My Archived", actorFor(user.id));
    await expect(
      createEvent(actorFor(user.id), {
        slug: "my-archived",
        name: "Copy",
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({
      code: "SLUG_TAKEN",
      message: expect.stringContaining(
        `You archived an event with the slug "my-archived"`,
      ),
    });
  });

  it("names the owner account when the slug belongs to someone else's archived event", async () => {
    const { user, other } = await scenario();
    await archive("their-archived", "Their Archived", actorFor(user.id));
    await expect(
      createEvent(actorFor(other.id), {
        slug: "their-archived",
        name: "Copy",
        timezone: "UTC",
      }),
    ).rejects.toMatchObject({
      code: "SLUG_TAKEN",
      message: expect.stringContaining(
        `An archived event with the slug "their-archived" already exists under create-${counter}@example.com`,
      ),
    });
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