import { and, db, eq, schema } from "@dogfood/db";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createEvent,
  grantEventMembership,
  joinEvent,
  removeEventMembership,
  transitionEvent,
} from "@dogfood/events";
import { registerUser } from "@dogfood/auth";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

describe("event join and member management", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function openEvent(
    organizerId: string,
    overrides: { opensAt?: Date; closesAt?: Date } = {},
  ) {
    const event = await createEvent(actorFor(organizerId), {
      slug: `join-${Math.random().toString(36).slice(2, 8)}`,
      name: "Join Event",
      timezone: "UTC",
      registrationOpensAt: overrides.opensAt ?? null,
      registrationClosesAt: overrides.closesAt ?? null,
    });
    await transitionEvent(actorFor(organizerId), event.id, "REGISTRATION");
    return event;
  }

  it("lets a registered user join as participant during registration", async () => {
    const organizer = await registerUser({
      email: "org-join@example.com",
      password: "pass",
      displayName: "Org",
    });
    const user = await registerUser({
      email: "new@example.com",
      password: "pass",
      displayName: "New",
    });
    const event = await openEvent(organizer.id);

    const membership = await joinEvent(actorFor(user.id), event.id);
    expect(membership.role).toBe("PARTICIPANT");

    const again = await joinEvent(actorFor(user.id), event.id);
    expect(again.id).toBe(membership.id);

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "event.join"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("rejects joining outside the registration state", async () => {
    const organizer = await registerUser({
      email: "org-draft@example.com",
      password: "pass",
      displayName: "Org",
    });
    const user = await registerUser({
      email: "early@example.com",
      password: "pass",
      displayName: "Early",
    });
    const draft = await createEvent(actorFor(organizer.id), {
      slug: "still-draft",
      name: "Draft",
      timezone: "UTC",
    });

    await expect(joinEvent(actorFor(user.id), draft.id)).rejects.toMatchObject({
      code: "REGISTRATION_CLOSED",
    });

    await transitionEvent(actorFor(organizer.id), draft.id, "REGISTRATION");
    await transitionEvent(actorFor(organizer.id), draft.id, "SUBMISSIONS_OPEN");
    await expect(
      joinEvent(actorFor(user.id), draft.id),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("enforces the registration time window with server time", async () => {
    const organizer = await registerUser({
      email: "org-window@example.com",
      password: "pass",
      displayName: "Org",
    });
    const user = await registerUser({
      email: "window@example.com",
      password: "pass",
      displayName: "Window",
    });

    const notYet = await openEvent(organizer.id, {
      opensAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    await expect(
      joinEvent(actorFor(user.id), notYet.id),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });

    const closed = await openEvent(organizer.id, {
      closesAt: new Date(Date.now() - 60 * 1000),
    });
    await expect(
      joinEvent(actorFor(user.id), closed.id),
    ).rejects.toMatchObject({ code: "REGISTRATION_CLOSED" });
  });

  it("refuses self-join when the user already has a non-participant role", async () => {
    const organizer = await registerUser({
      email: "org-conflict@example.com",
      password: "pass",
      displayName: "Org",
    });
    const judge = await registerUser({
      email: "judge-conflict@example.com",
      password: "pass",
      displayName: "Judge",
    });
    const event = await openEvent(organizer.id);
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      judge.id,
      "JUDGE",
    );

    await expect(
      joinEvent(actorFor(judge.id), event.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets an organizer change a participant to judge and back", async () => {
    const organizer = await registerUser({
      email: "org-role@example.com",
      password: "pass",
      displayName: "Org",
    });
    const user = await registerUser({
      email: "role@example.com",
      password: "pass",
      displayName: "Role",
    });
    const event = await openEvent(organizer.id);
    await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      user.id,
      "PARTICIPANT",
    );

    const asJudge = await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      user.id,
      "JUDGE",
    );
    expect(asJudge.role).toBe("JUDGE");

    const backToParticipant = await grantEventMembership(
      actorFor(organizer.id),
      event.id,
      user.id,
      "PARTICIPANT",
    );
    expect(backToParticipant.role).toBe("PARTICIPANT");
  });

  it("lets an organizer remove a member and writes an audit event", async () => {
    const organizer = await registerUser({
      email: "org-rm@example.com",
      password: "pass",
      displayName: "Org",
    });
    const user = await registerUser({
      email: "remove@example.com",
      password: "pass",
      displayName: "Remove",
    });
    const event = await openEvent(organizer.id);
    const membership = await joinEvent(actorFor(user.id), event.id);

    await removeEventMembership(actorFor(organizer.id), event.id, user.id);

    const rows = await db
      .select()
      .from(schema.eventMemberships)
      .where(eq(schema.eventMemberships.id, membership.id));
    expect(rows).toHaveLength(0);

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        and(
          eq(schema.auditEvents.eventId, event.id),
          eq(schema.auditEvents.action, "event.member.remove"),
        ),
      );
    expect(audits).toHaveLength(1);
  });

  it("refuses to remove a non-member or the last organizer", async () => {
    const organizer = await registerUser({
      email: "org-last@example.com",
      password: "pass",
      displayName: "Org",
    });
    const stranger = await registerUser({
      email: "stranger@example.com",
      password: "pass",
      displayName: "Stranger",
    });
    const event = await openEvent(organizer.id);

    await expect(
      removeEventMembership(actorFor(organizer.id), event.id, stranger.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      removeEventMembership(actorFor(organizer.id), event.id, organizer.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents participants from granting or removing memberships", async () => {
    const organizer = await registerUser({
      email: "org-deny@example.com",
      password: "pass",
      displayName: "Org",
    });
    const participant = await registerUser({
      email: "pat-deny@example.com",
      password: "pass",
      displayName: "Pat",
    });
    const target = await registerUser({
      email: "target@example.com",
      password: "pass",
      displayName: "Target",
    });
    const event = await openEvent(organizer.id);
    await joinEvent(actorFor(participant.id), event.id);

    await expect(
      grantEventMembership(
        actorFor(participant.id),
        event.id,
        target.id,
        "PARTICIPANT",
      ),
    ).rejects.toBeInstanceOf(DogfoodError);

    await expect(
      removeEventMembership(
        actorFor(participant.id),
        event.id,
        target.id,
      ),
    ).rejects.toBeInstanceOf(DogfoodError);
  });
});