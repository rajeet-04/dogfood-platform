import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { addEventTrack, createEvent, createPrize, deletePrize, listEventPrizes, updatePrize } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

describe("event prizes", () => {
  beforeEach(async () => resetDb());

  async function makeOrganizer(email: string) {
    const user = await registerUser({ email, password: "pass", displayName: "Organizer" });
    const actor = actorFor(user.id);
    const event = await createEvent(actor, { slug: email.split("@")[0], name: "Prize Event", timezone: "UTC" });
    return { actor, event, user };
  }

  it("manages ordered event prizes, including an optional track scope", async () => {
    const { actor, event } = await makeOrganizer("prizes@example.com");
    const track = await addEventTrack(actor, event.id, "Robotics");
    const second = await createPrize(actor, event.id, { name: "Best Demo", trackId: track.id, amount: "2500", currency: "usd", sortOrder: 1 });
    const first = await createPrize(actor, event.id, { name: "Grand Prize", amount: "5000.00", currency: "USD", sortOrder: 0 });
    expect((await listEventPrizes(event.id)).map((prize) => prize.id)).toEqual([first.id, second.id]);
    const updated = await updatePrize(actor, event.id, second.id, { description: "Awarded to one project", trackId: null });
    expect(updated).toMatchObject({ description: "Awarded to one project", trackId: null, currency: "USD" });
    await deletePrize(actor, event.id, first.id);
    expect((await listEventPrizes(event.id)).map((prize) => prize.id)).toEqual([second.id]);
  });

  it("rejects participants and organizers from another event, and rejects foreign tracks", async () => {
    const { actor, event } = await makeOrganizer("prize-owner@example.com");
    const other = await makeOrganizer("prize-other@example.com");
    const participant = await registerUser({ email: "prize-participant@example.com", password: "pass", displayName: "Participant" });
    await db.insert(schema.eventMemberships).values({ eventId: event.id, userId: participant.id, role: "PARTICIPANT" });
    const otherTrack = await addEventTrack(other.actor, other.event.id, "Other event track");

    await expect(createPrize(actorFor(participant.id), event.id, { name: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPrize(other.actor, event.id, { name: "Nope" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createPrize(actor, event.id, { name: "Nope", trackId: otherTrack.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const prizes = await db.select().from(schema.eventPrizes).where(eq(schema.eventPrizes.eventId, event.id));
    expect(prizes).toHaveLength(0);
  });
});
