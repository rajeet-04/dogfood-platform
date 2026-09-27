import { and, eq, sqlState } from "@dogfood/db";
import { beforeEach, describe, expect, it } from "vitest";

import {
  authenticateCredentials,
  createSession,
  registerUser,
  resolveSession,
  revokeSession,
} from "@dogfood/auth";
import { createEvent, grantEventMembership, transitionEvent } from "@dogfood/events";
import { db, schema } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

describe("identity, sessions, events, and memberships", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("registers a user and rejects duplicate email case-insensitively", async () => {
    const user = await registerUser({
      email: "alice@example.com",
      password: "password-1",
      displayName: "Alice",
    });
    expect(user.email).toBe("alice@example.com");
    expect(user.id).toBeTruthy();

    await expect(
      registerUser({
        email: "ALICE@example.com",
        password: "other-pass",
        displayName: "Alice Two",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("authenticates with correct password and rejects wrong password generically", async () => {
    await registerUser({
      email: "bob@example.com",
      password: "right-pass",
      displayName: "Bob",
    });
    const ok = await authenticateCredentials({
      email: "bob@example.com",
      password: "right-pass",
    });
    expect(ok.displayName).toBe("Bob");

    await expect(
      authenticateCredentials({ email: "bob@example.com", password: "wrong" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    await expect(
      authenticateCredentials({ email: "ghost@example.com", password: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("creates and resolves sessions, and rejects expired and revoked sessions", async () => {
    const user = await registerUser({
      email: "carol@example.com",
      password: "pass",
      displayName: "Carol",
    });
    const { rawToken } = await createSession(user.id);
    expect(rawToken).toBeTruthy();

    expect(await resolveSession(rawToken)).toMatchObject({ userId: user.id });

    const rows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    expect(rows).toHaveLength(1);

    await db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.id, rows[0].id));
    expect(await resolveSession(rawToken)).toBeNull();

    const { rawToken: second } = await createSession(user.id);
    const secondRows = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.userId, user.id));
    await revokeSession(secondRows[1].id);
    expect(await resolveSession(second)).toBeNull();
  });

  it("makes the event creator an organizer and enforces the state machine", async () => {
    const user = await registerUser({
      email: "dave@example.com",
      password: "pass",
      displayName: "Dave",
    });
    const actor = actorFor(user.id);
    const event = await createEvent(actor, {
      slug: "hack-2026",
      name: "Hack 2026",
      timezone: "UTC",
    });
    expect(event.state).toBe("DRAFT");

    const membership = await db
      .select()
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, event.id),
          eq(schema.eventMemberships.userId, user.id),
        ),
      );
    expect(membership[0].role).toBe("ORGANIZER");

    const advanced = await transitionEvent(actor, event.id, "REGISTRATION");
    expect(advanced.state).toBe("REGISTRATION");

    await expect(
      transitionEvent(actor, event.id, "JUDGING"),
    ).rejects.toBeInstanceOf(DogfoodError);
  });

  it("allows the same user to hold different roles in different events", async () => {
    const organizer = await registerUser({
      email: "org@example.com",
      password: "pass",
      displayName: "Org",
    });
    const participant = await registerUser({
      email: "multi@example.com",
      password: "pass",
      displayName: "Multi",
    });

    const eventA = await createEvent(actorFor(organizer.id), {
      slug: "event-a",
      name: "Event A",
      timezone: "UTC",
    });
    const eventB = await createEvent(actorFor(organizer.id), {
      slug: "event-b",
      name: "Event B",
      timezone: "UTC",
    });

    const inA = await grantEventMembership(
      actorFor(organizer.id),
      eventA.id,
      participant.id,
      "PARTICIPANT",
    );
    const inB = await grantEventMembership(
      actorFor(organizer.id),
      eventB.id,
      participant.id,
      "JUDGE",
    );

    expect(inA.role).toBe("PARTICIPANT");
    expect(inB.role).toBe("JUDGE");
  });

  it("rejects a user becoming both organizer and judge in the same event", async () => {
    const organizer = await registerUser({
      email: "org2@example.com",
      password: "pass",
      displayName: "Org2",
    });
    const event = await createEvent(actorFor(organizer.id), {
      slug: "event-c",
      name: "Event C",
      timezone: "UTC",
    });

    await expect(
      grantEventMembership(
        actorFor(organizer.id),
        event.id,
        organizer.id,
        "JUDGE",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const judge = await registerUser({
      email: "judge2@example.com",
      password: "pass",
      displayName: "Judge2",
    });
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      judge.id,
      "JUDGE",
    );
    await expect(
      grantEventMembership(
        actorFor(organizer.id),
        event.id,
        judge.id,
        "ORGANIZER",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("enforces UNIQUE(event_id, user_id) at the database level", async () => {
    const user = await registerUser({
      email: "dup@example.com",
      password: "pass",
      displayName: "Dup",
    });
    const event = await createEvent(actorFor(user.id), {
      slug: "event-d",
      name: "Event D",
      timezone: "UTC",
    });

    let violation: string | undefined;
    try {
      await db.insert(schema.eventMemberships).values({
        eventId: event.id,
        userId: user.id,
        role: "PARTICIPANT",
      });
    } catch (error) {
      violation = sqlState(error);
    }
    expect(violation).toBe("23505");
  });
});