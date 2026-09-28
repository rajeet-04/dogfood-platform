import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import {
  addCustomQuestion,
  addEventTrack,
  createEvent,
  moveCustomQuestion,
  moveEventTrack,
  removeCustomQuestion,
  removeEventTrack,
  updateCustomQuestion,
  updateEventTrack,
} from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

describe("submission settings", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function scenario() {
    const user = await registerUser({
      email: "settings-org@example.com",
      password: "pass",
      displayName: "Organizer",
    });
    const actor = actorFor(user.id);
    const event = await createEvent(actor, {
      slug: "submission-settings",
      name: "Submission Settings",
      timezone: "UTC",
    });
    return { actor, event };
  }

  it("defaults new question visibility to organizer-only", async () => {
    const { actor, event } = await scenario();
    const question = await addCustomQuestion(actor, event.id, {
      prompt: "Anything private?",
      required: false,
    });

    expect(question.visibility).toBe("ORGANIZER_ONLY");
  });

  it("lets organizers rename and reorder tracks and reorder questions", async () => {
    const { actor, event } = await scenario();
    const first = await addEventTrack(actor, event.id, "First");
    const second = await addEventTrack(actor, event.id, "Second");
    await updateEventTrack(actor, event.id, second.id, "Renamed");
    await moveEventTrack(actor, event.id, second.id, "UP");

    const tracks = await db.select().from(schema.eventTracks)
      .where(eq(schema.eventTracks.eventId, event.id)).orderBy(schema.eventTracks.sortOrder);
    expect(tracks.map((track) => track.name)).toEqual(["Renamed", "First"]);
    expect(tracks.map((track) => track.sortOrder)).toEqual([0, 1]);

    const q1 = await addCustomQuestion(actor, event.id, { prompt: "Question 1", required: false });
    const q2 = await addCustomQuestion(actor, event.id, { prompt: "Question 2", required: false });
    await moveCustomQuestion(actor, event.id, q2.id, "UP");
    await updateCustomQuestion(actor, event.id, q1.id, { prompt: "Edited question", required: true, visibility: "PUBLIC" });
    await removeCustomQuestion(actor, event.id, q2.id);
    await removeEventTrack(actor, event.id, first.id);

    const [updatedEvent] = await db.select().from(schema.events).where(eq(schema.events.id, event.id));
    expect(updatedEvent.customQuestions).toEqual([
      { ...q1, prompt: "Edited question", required: true, visibility: "PUBLIC", order: 0 },
    ]);
  });
});
