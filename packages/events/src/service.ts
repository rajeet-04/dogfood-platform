import { and, db, eq, schema, type EventRole, type EventState } from "@dogfood/db";
import { ACTION, requirePermission, type Action } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

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

async function membershipRoles(
  userId: string,
  eventId: string,
): Promise<EventRole[]> {
  const rows = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, userId),
        eq(schema.eventMemberships.eventId, eventId),
      ),
    );
  return rows.map((row) => row.role);
}

async function requireEventPermission(
  actor: Actor,
  eventId: string,
  eventState: EventState,
  action: Action,
): Promise<void> {
  const roles = await membershipRoles(actor.userId, eventId);
  requirePermission(actor, action, {
    eventId,
    resourceEventId: eventId,
    roles,
    eventState,
  });
}

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
  actor: Actor,
  eventId: string,
  toState: EventState,
): Promise<EventRow> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = rows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    event.id,
    event.state as EventState,
    ACTION.EVENT_TRANSITION,
  );

  assertEventTransition(event.state as EventState, toState);

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.events)
      .set({ state: toState, updatedAt: new Date() })
      .where(eq(schema.events.id, eventId))
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "event.transition",
      resourceType: "event",
      resourceId: event.id,
      metadata: { from: event.state, to: toState },
    });
    return row;
  });
  return updated;
}

export async function grantEventMembership(
  actor: Actor,
  eventId: string,
  userId: string,
  role: EventRole,
): Promise<MembershipRow> {
  const events = await db
    .select({ state: schema.events.state })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = events[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.MEMBER_INVITE,
  );

  const existing = await db
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
    const [updated] = await db
      .update(schema.eventMemberships)
      .set({ role })
      .where(eq(schema.eventMemberships.id, current.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(schema.eventMemberships)
    .values({ eventId, userId, role })
    .returning();
  return created;
}