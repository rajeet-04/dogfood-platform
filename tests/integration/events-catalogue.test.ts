import { db, eq, schema } from "@dogfood/db";
import { beforeEach, describe, expect, it } from "vitest";

import { registerUser } from "@dogfood/auth";
import {
  createEvent,
  grantEventMembership,
  listEvents,
  transitionEvent,
} from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

const ADMIN: Actor = {
  userId: "00000000-0000-4000-8000-000000000000",
  isPlatformAdmin: true,
};

let counter = 0;

async function advance(
  organizer: Actor,
  eventId: string,
  states: string[],
): Promise<void> {
  for (const to of states) {
    await transitionEvent(organizer, eventId, to as never);
  }
}

describe("event catalogue listEvents", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function scenario() {
    counter += 1;
    const organizer = await registerUser({
      email: `cat-org-${counter}@example.com`,
      password: "pass",
      displayName: "Cat Org",
    });
    const other = await registerUser({
      email: `cat-other-${counter}@example.com`,
      password: "pass",
      displayName: "Cat Other",
    });

    const pub = await createEvent(actorFor(organizer.id), {
      slug: `cat-pub-${counter}`,
      name: "Summer Hack",
      description: "Build something great this summer",
      timezone: "UTC",
    });
    const draft = await createEvent(actorFor(organizer.id), {
      slug: `cat-draft-${counter}`,
      name: "Secret Draft",
      timezone: "UTC",
    });
    const archived = await createEvent(actorFor(organizer.id), {
      slug: `cat-arch-${counter}`,
      name: "Old Hack",
      timezone: "UTC",
    });

    await advance(actorFor(organizer.id), pub.id, [
      "REGISTRATION",
    ]);
    await advance(actorFor(organizer.id), archived.id, [
      "REGISTRATION",
      "SUBMISSIONS_OPEN",
      "SUBMISSIONS_CLOSED",
      "JUDGING",
      "RESULTS_READY",
      "PUBLISHED",
      "ARCHIVED",
    ]);

    return { organizer, other, pub, draft, archived };
  }

  it("hides drafts and archived events from anonymous visitors", async () => {
    const { pub, draft, archived } = await scenario();
    const rows = await listEvents(null);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(pub.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(archived.id);
  });

  it("lets the creator see their own drafts", async () => {
    const { organizer, pub, draft } = await scenario();
    const rows = await listEvents(actorFor(organizer.id));
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(pub.id);
    expect(ids).toContain(draft.id);
  });

  it("lets the creator see their own archived events", async () => {
    const { organizer, archived } = await scenario();
    const rows = await listEvents(actorFor(organizer.id));
    expect(rows.map((row) => row.id)).toContain(archived.id);
  });

  it("keeps archived events hidden from other users", async () => {
    const { other, archived } = await scenario();
    const rows = await listEvents(actorFor(other.id));
    expect(rows.map((row) => row.id)).not.toContain(archived.id);
    const anonymous = await listEvents(null);
    expect(anonymous.map((row) => row.id)).not.toContain(archived.id);
  });

  it("hides another user's drafts", async () => {
    const { other, draft } = await scenario();
    const rows = await listEvents(actorFor(other.id));
    expect(rows.map((row) => row.id)).not.toContain(draft.id);
  });

  it("lets added members see a draft event", async () => {
    const { organizer, other, draft } = await scenario();
    await grantEventMembership(
      actorFor(organizer.id),
      draft.id,
      other.id,
      "PARTICIPANT",
    );
    const rows = await listEvents(actorFor(other.id));
    expect(rows.map((row) => row.id)).toContain(draft.id);

    const anonymous = await listEvents(null);
    expect(anonymous.map((row) => row.id)).not.toContain(draft.id);
  });

  it("lets a platform admin see drafts but still hides archived events", async () => {
    const { pub, draft, archived } = await scenario();
    const rows = await listEvents(ADMIN);
    const ids = rows.map((row) => row.id);
    expect(ids).toContain(pub.id);
    expect(ids).toContain(draft.id);
    expect(ids).not.toContain(archived.id);
  });

  it("matches search across name, slug, and description case-insensitively", async () => {
    const { pub } = await scenario();
    const byName = await listEvents(null, { q: "summer" });
    expect(byName.map((row) => row.id)).toContain(pub.id);
    const bySlug = await listEvents(null, { q: "cat-pub" });
    expect(bySlug.map((row) => row.id)).toContain(pub.id);
    const byDescription = await listEvents(null, { q: "something great" });
    expect(byDescription.map((row) => row.id)).toContain(pub.id);
  });

  it("treats LIKE wildcards as literals", async () => {
    counter += 1;
    const organizer = await registerUser({
      email: `cat-wild-${counter}@example.com`,
      password: "pass",
      displayName: "Wild Org",
    });
    const percent = await createEvent(actorFor(organizer.id), {
      slug: `cat-percent-${counter}`,
      name: "100% Real Deal",
      timezone: "UTC",
    });
    const underscore = await createEvent(actorFor(organizer.id), {
      slug: `cat-snake-${counter}`,
      name: "Snake_Case Hack",
      timezone: "UTC",
    });
    await transitionEvent(actorFor(organizer.id), percent.id, "REGISTRATION");
    await transitionEvent(actorFor(organizer.id), underscore.id, "REGISTRATION");

    const percentHit = await listEvents(null, { q: "100%" });
    expect(percentHit.map((row) => row.id)).toEqual([percent.id]);
    const percentMiss = await listEvents(null, { q: "%" });
    expect(percentMiss.map((row) => row.id)).toEqual(
      [percent.id],
      "a bare % should only match events containing a literal %",
    );

    const underscoreHit = await listEvents(null, { q: "_" });
    expect(underscoreHit.map((row) => row.id)).toEqual(
      [underscore.id],
      "a bare _ should only match events containing a literal _",
    );
  });

  it("filters by state without surfacing archived events", async () => {
    const { pub, draft, archived } = await scenario();
    const registration = await listEvents(null, { state: "REGISTRATION" });
    const ids = registration.map((row) => row.id);
    expect(ids).toContain(pub.id);
    expect(ids).not.toContain(draft.id);
    expect(ids).not.toContain(archived.id);

    const archivedFilter = await listEvents(null, { state: "ARCHIVED" });
    expect(archivedFilter).toEqual([]);
  });

  it("respects the limit", async () => {
    await scenario();
    const rows = await listEvents(null, { limit: 1 });
    expect(rows).toHaveLength(1);
  });

  it("re-archives and unarchives reversibly via the state machine", async () => {
    const { organizer, archived } = await scenario();
    await transitionEvent(actorFor(organizer.id), archived.id, "PUBLISHED");
    const rows = await db
      .select({ state: schema.events.state })
      .from(schema.events)
      .where(eq(schema.events.id, archived.id));
    expect(rows[0].state).toBe("PUBLISHED");

    const audits = await db
      .select()
      .from(schema.auditEvents)
      .where(
        eq(schema.auditEvents.eventId, archived.id),
      );
    expect(audits.map((a) => a.metadata)).toContainEqual(
      expect.objectContaining({ from: "ARCHIVED", to: "PUBLISHED" }),
    );
  });

  it("returns an unarchived event to the public catalogue", async () => {
    const { organizer, archived } = await scenario();
    expect(
      (await listEvents(null)).map((row) => row.id),
    ).not.toContain(archived.id);

    await transitionEvent(actorFor(organizer.id), archived.id, "PUBLISHED");

    expect(
      (await listEvents(null)).map((row) => row.id),
    ).toContain(archived.id);
  });
});