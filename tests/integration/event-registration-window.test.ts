import { and, db, eq, schema } from "@dogfood/db";
import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import {
  createEvent,
  joinEvent,
  transitionEvent,
  updateEventRegistrationWindow,
} from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

let counter = 0;

describe("event registration window settings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function scenario() {
    counter += 1;
    const organizer = await registerUser({
      email: `org-win-${counter}@example.com`,
      password: "pass",
      displayName: "Org",
    });
    const user = await registerUser({
      email: `user-win-${counter}@example.com`,
      password: "pass",
      displayName: "User",
    });
    const event = await createEvent(actorFor(organizer.id), {
      slug: `window-${counter}`,
      name: "Window Event",
      timezone: "UTC",
    });
    return { organizer, user, event };
  }

  it("lets an organizer set the registration window", async () => {
    const { organizer, event } = await scenario();
    const opensAt = new Date(Date.now() - 60 * 60 * 1000);
    const closesAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await updateEventRegistrationWindow(actorFor(organizer.id), event.id, {
      registrationOpensAt: opensAt,
      registrationClosesAt: closesAt,
    });

    const rows = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, event.id));
    expect(rows[0].registrationOpensAt?.toISOString()).toBe(
      opensAt.toISOString(),
    );
    expect(rows[0].registrationClosesAt?.toISOString()).toBe(
      closesAt.toISOString(),
    );

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "event.registration_window"),
        ),
      );
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata).toMatchObject({
      opensAt: opensAt.toISOString(),
      closesAt: closesAt.toISOString(),
    });
  });

  it("persists cleared boundaries as null", async () => {
    const { organizer, event } = await scenario();
    await updateEventRegistrationWindow(actorFor(organizer.id), event.id, {
      registrationOpensAt: null,
      registrationClosesAt: null,
    });

    const rows = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, event.id));
    expect(rows[0].registrationOpensAt).toBeNull();
    expect(rows[0].registrationClosesAt).toBeNull();
  });

  it("treats empty-string boundaries as null", async () => {
    const { organizer, event } = await scenario();
    const empty = "" as unknown as Date;
    await updateEventRegistrationWindow(actorFor(organizer.id), event.id, {
      registrationOpensAt: empty,
      registrationClosesAt: empty,
    });

    const rows = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, event.id));
    expect(rows[0].registrationOpensAt).toBeNull();
    expect(rows[0].registrationClosesAt).toBeNull();
  });

  it("rejects an inverted window", async () => {
    const { organizer, event } = await scenario();
    await expect(
      updateEventRegistrationWindow(actorFor(organizer.id), event.id, {
        registrationOpensAt: new Date(Date.now() + 60 * 1000),
        registrationClosesAt: new Date(Date.now() - 60 * 1000),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("only organizers can change the window", async () => {
    const { user, event } = await scenario();
    await expect(
      updateEventRegistrationWindow(actorFor(user.id), event.id, {
        registrationOpensAt: new Date(),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("joinEvent honors a window saved after creation", async () => {
    const { organizer, user, event } = await scenario();
    await transitionEvent(actorFor(organizer.id), event.id, "REGISTRATION");

    const opensAt = new Date(Date.now() - 60 * 1000);
    const closesAt = new Date(Date.now() + 60 * 60 * 1000);
    await updateEventRegistrationWindow(actorFor(organizer.id), event.id, {
      registrationOpensAt: opensAt,
      registrationClosesAt: closesAt,
    });

    const membership = await joinEvent(actorFor(user.id), event.id);
    expect(membership.role).toBe("PARTICIPANT");
  });
});