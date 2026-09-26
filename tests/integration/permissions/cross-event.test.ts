import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import {
  createEvent,
  grantEventMembership,
  transitionEvent,
} from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

describe("cross-event isolation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lets an organizer mutate their own event", async () => {
    const owner = await registerUser({
      email: "owner@example.com",
      password: "pass",
      displayName: "Owner",
    });
    const event = await createEvent(actorFor(owner.id), {
      slug: "own-event",
      name: "Own Event",
      timezone: "UTC",
    });

    const advanced = await transitionEvent(
      actorFor(owner.id),
      event.id,
      "REGISTRATION",
    );
    expect(advanced.state).toBe("REGISTRATION");
  });

  it("denies an organizer of Event A from mutating Event B even with its UUID", async () => {
    const ownerA = await registerUser({
      email: "owner-a@example.com",
      password: "pass",
      displayName: "OwnerA",
    });
    const ownerB = await registerUser({
      email: "owner-b@example.com",
      password: "pass",
      displayName: "OwnerB",
    });
    const eventA = await createEvent(actorFor(ownerA.id), {
      slug: "event-a",
      name: "Event A",
      timezone: "UTC",
    });
    const eventB = await createEvent(actorFor(ownerB.id), {
      slug: "event-b",
      name: "Event B",
      timezone: "UTC",
    });

    await expect(
      transitionEvent(actorFor(ownerA.id), eventB.id, "REGISTRATION"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const judge = await registerUser({
      email: "judge@example.com",
      password: "pass",
      displayName: "Judge",
    });
    await expect(
      grantEventMembership(actorFor(ownerA.id), eventB.id, judge.id, "JUDGE"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    expect(eventA.id).not.toBe(eventB.id);
  });

  it("prevents members of Event A from touching memberships in Event B", async () => {
    const ownerA = await registerUser({
      email: "owner-c@example.com",
      password: "pass",
      displayName: "OwnerC",
    });
    const ownerB = await registerUser({
      email: "owner-d@example.com",
      password: "pass",
      displayName: "OwnerD",
    });
    const eventA = await createEvent(actorFor(ownerA.id), {
      slug: "event-c",
      name: "Event C",
      timezone: "UTC",
    });
    await createEvent(actorFor(ownerB.id), {
      slug: "event-d",
      name: "Event D",
      timezone: "UTC",
    });

    const member = await registerUser({
      email: "member@example.com",
      password: "pass",
      displayName: "Member",
    });
    await grantEventMembership(
      actorFor(ownerA.id),
      eventA.id,
      member.id,
      "PARTICIPANT",
    );

    await expect(
      grantEventMembership(
        actorFor(member.id),
        eventA.id,
        ownerA.id,
        "JUDGE",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("prevents participants and judges from configuring the event", async () => {
    const owner = await registerUser({
      email: "owner-e@example.com",
      password: "pass",
      displayName: "OwnerE",
    });
    const judge = await registerUser({
      email: "judge-e@example.com",
      password: "pass",
      displayName: "JudgeE",
    });
    const participant = await registerUser({
      email: "participant-e@example.com",
      password: "pass",
      displayName: "ParticipantE",
    });
    const event = await createEvent(actorFor(owner.id), {
      slug: "event-e",
      name: "Event E",
      timezone: "UTC",
    });

    await grantEventMembership(actorFor(owner.id), event.id, judge.id, "JUDGE");
    await grantEventMembership(
      actorFor(owner.id),
      event.id,
      participant.id,
      "PARTICIPANT",
    );

    await expect(
      transitionEvent(actorFor(judge.id), event.id, "REGISTRATION"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      grantEventMembership(
        actorFor(participant.id),
        event.id,
        judge.id,
        "JUDGE",
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});