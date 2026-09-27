import { and, db, eq, schema, type EventRole, type EventState } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import { assertEventTransition } from "./domain";

export type CreateEventInput = {
  slug: string;
  name: string;
  description?: string | null;
  timezone: string;
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
  submissionOpensAt?: Date | null;
  submissionClosesAt?: Date | null;
  judgingOpensAt?: Date | null;
  judgingClosesAt?: Date | null;
};

export type EventRow = typeof schema.events.$inferSelect;
export type MembershipRow = typeof schema.eventMemberships.$inferSelect;

export async function createEvent(
  actor: Actor,
  input: CreateEventInput,
): Promise<EventRow> {
  const event = await db.transaction(async (tx) => {
    const [created] = await tx.insert(schema.events).values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      timezone: input.timezone,
      registrationOpensAt: input.registrationOpensAt ?? null,
      registrationClosesAt: input.registrationClosesAt ?? null,
      submissionOpensAt: input.submissionOpensAt ?? null,
      submissionClosesAt: input.submissionClosesAt ?? null,
      judgingOpensAt: input.judgingOpensAt ?? null,
      judgingClosesAt: input.judgingClosesAt ?? null,
      createdBy: actor.userId,
    }).returning();

    await tx.insert(schema.eventMemberships).values({
      eventId: created.id,
      userId: actor.userId,
      role: "ORGANIZER",
    });

    return created;
  });
  return event;
}

export async function transitionEvent(
  _actor: Actor,
  eventId: string,
  toState: EventState,
): Promise<EventRow> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(schema.events)
      .where(eq(schema.events.id, eventId))
      .limit(1);
    const event = rows[0];
    if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

    assertEventTransition(event.state as EventState, toState);

    const [updated] = await tx
      .update(schema.events)
      .set({ state: toState, updatedAt: new Date() })
      .where(eq(schema.events.id, eventId))
      .returning();
    return updated;
  });
}

export async function grantEventMembership(
  _actor: Actor,
  eventId: string,
  userId: string,
  role: EventRole,
): Promise<MembershipRow> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, eventId),
          eq(schema.eventMemberships.userId, userId),
        ),
      )
      .limit(1);
    const current = existing[0];

    if (current) {
      if (current.role === role) return current;
      const conflict =
        (current.role === "ORGANIZER" && role === "JUDGE") ||
        (current.role === "JUDGE" && role === "ORGANIZER");
      if (conflict) {
        throw new DogfoodError(
          "FORBIDDEN",
          "A user cannot be both organizer and judge in the same event",
        );
      }
      const [updated] = await tx
        .update(schema.eventMemberships)
        .set({ role })
        .where(eq(schema.eventMemberships.id, current.id))
        .returning();
      return updated;
    }

    const [created] = await tx
      .insert(schema.eventMemberships)
      .values({ eventId, userId, role })
      .returning();
    return created;
  });
}