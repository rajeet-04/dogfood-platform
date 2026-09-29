import {
  and,
  db,
  desc,
  eq,
  ilike,
  ne,
  or,
  schema,
  sql,
  sqlState,
  type EventRole,
  type EventState,
  type SQL,
} from "@dogfood/db";
import { ACTION, requirePermission, type Action } from "@dogfood/permissions";
import { actorDisplayName, notify, notifyMany } from "@dogfood/notifications";
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
  websiteUrl?: string | null;
  prizeInfo?: string | null;
  timeline?: string | null;
  schedule?: string | null;
  rules?: string | null;
  maxTeamSize?: number | null;
};

export type EventRow = typeof schema.events.$inferSelect;
export type MembershipRow = typeof schema.eventMemberships.$inferSelect;
export type PrizeRow = typeof schema.eventPrizes.$inferSelect;

export type PrizeInput = {
  name: string;
  description?: string | null;
  trackId?: string | null;
  amount?: string | null;
  currency?: string | null;
  sortOrder?: number;
};

function normalizePrizeInput(input: PrizeInput) {
  const name = normalizeText(input.name);
  if (!name || name.length > 120) {
    throw new DogfoodError("VALIDATION_FAILED", "Prize name is required and must be at most 120 characters");
  }
  const amount = normalizeText(input.amount);
  if (amount && !/^\d+(?:\.\d{1,2})?$/.test(amount)) {
    throw new DogfoodError("VALIDATION_FAILED", "Prize amount must be a non-negative amount with up to two decimal places");
  }
  const currency = normalizeText(input.currency)?.toUpperCase() ?? null;
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    throw new DogfoodError("VALIDATION_FAILED", "Currency must be a three-letter code");
  }
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) {
    throw new DogfoodError("VALIDATION_FAILED", "Sort order must be a whole number between 0 and 100000");
  }
  return {
    name,
    description: normalizeText(input.description),
    trackId: normalizeText(input.trackId),
    amount,
    currency,
    sortOrder,
  };
}

export async function listEventPrizes(eventId: string): Promise<PrizeRow[]> {
  const [event] = await db.select({ id: schema.events.id }).from(schema.events)
    .where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  return db.select().from(schema.eventPrizes)
    .where(eq(schema.eventPrizes.eventId, eventId))
    .orderBy(schema.eventPrizes.sortOrder, schema.eventPrizes.createdAt);
}

export async function createPrize(actor: Actor, eventId: string, input: PrizeInput): Promise<PrizeRow> {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state, ACTION.EVENT_CONFIGURE);
  const values = normalizePrizeInput(input);
  if (values.trackId) {
    const [track] = await db.select({ id: schema.eventTracks.id }).from(schema.eventTracks)
      .where(and(eq(schema.eventTracks.id, values.trackId), eq(schema.eventTracks.eventId, eventId))).limit(1);
    if (!track) throw new DogfoodError("NOT_FOUND", "Track not found in this event");
  }
  return db.transaction(async (tx) => {
    const [prize] = await tx.insert(schema.eventPrizes).values({ eventId, ...values }).returning();
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "prize.create", resourceType: "prize", resourceId: prize.id, metadata: { name: prize.name, trackId: prize.trackId } });
    return prize;
  });
}

export async function updatePrize(actor: Actor, eventId: string, prizeId: string, input: Partial<PrizeInput>): Promise<PrizeRow> {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state, ACTION.EVENT_CONFIGURE);
  const [existing] = await db.select().from(schema.eventPrizes)
    .where(and(eq(schema.eventPrizes.id, prizeId), eq(schema.eventPrizes.eventId, eventId))).limit(1);
  if (!existing) throw new DogfoodError("NOT_FOUND", "Prize not found");
  const next = normalizePrizeInput({
    name: input.name ?? existing.name,
    description: input.description === undefined ? existing.description : input.description,
    trackId: input.trackId === undefined ? existing.trackId : input.trackId,
    amount: input.amount === undefined ? existing.amount : input.amount,
    currency: input.currency === undefined ? existing.currency : input.currency,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  });
  if (next.trackId) {
    const [track] = await db.select({ id: schema.eventTracks.id }).from(schema.eventTracks)
      .where(and(eq(schema.eventTracks.id, next.trackId), eq(schema.eventTracks.eventId, eventId))).limit(1);
    if (!track) throw new DogfoodError("NOT_FOUND", "Track not found in this event");
  }
  return db.transaction(async (tx) => {
    const [prize] = await tx.update(schema.eventPrizes).set(next)
      .where(and(eq(schema.eventPrizes.id, prizeId), eq(schema.eventPrizes.eventId, eventId))).returning();
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "prize.update", resourceType: "prize", resourceId: prizeId, metadata: { name: prize.name, trackId: prize.trackId } });
    return prize;
  });
}

export async function deletePrize(actor: Actor, eventId: string, prizeId: string): Promise<void> {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  await requireEventPermission(actor, eventId, event.state, ACTION.EVENT_CONFIGURE);
  if (event.state === "PUBLISHED" || event.state === "ARCHIVED") {
    throw new DogfoodError("CONFLICT", "Published event prizes cannot be deleted");
  }
  const [prize] = await db.select().from(schema.eventPrizes)
    .where(and(eq(schema.eventPrizes.id, prizeId), eq(schema.eventPrizes.eventId, eventId))).limit(1);
  if (!prize) throw new DogfoodError("NOT_FOUND", "Prize not found");
  await db.transaction(async (tx) => {
    await tx.delete(schema.eventPrizes).where(and(eq(schema.eventPrizes.id, prizeId), eq(schema.eventPrizes.eventId, eventId)));
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "prize.delete", resourceType: "prize", resourceId: prizeId, metadata: { name: prize.name } });
  });
}

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

function toNullableDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return Number.isNaN(value.getTime()) ? null : value;
}

function normalizeText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function normalizeWebsiteUrl(value: string | null | undefined): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  const candidate = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeMaxTeamSize(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 100) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Maximum team size must be a whole number between 2 and 100",
    );
  }
  return parsed;
}

export async function createEvent(
  actor: Actor,
  input: CreateEventInput,
): Promise<EventRow> {
  try {
    return await db.transaction(async (tx) => {
      const [created] = await tx.insert(schema.events).values({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        timezone: input.timezone,
        registrationOpensAt: toNullableDate(input.registrationOpensAt),
        registrationClosesAt: toNullableDate(input.registrationClosesAt),
        submissionOpensAt: toNullableDate(input.submissionOpensAt),
        submissionClosesAt: toNullableDate(input.submissionClosesAt),
        judgingOpensAt: toNullableDate(input.judgingOpensAt),
        judgingClosesAt: toNullableDate(input.judgingClosesAt),
        websiteUrl: normalizeWebsiteUrl(input.websiteUrl),
        prizeInfo: normalizeText(input.prizeInfo),
        timeline: normalizeText(input.timeline),
        schedule: normalizeText(input.schedule),
        rules: normalizeText(input.rules),
        maxTeamSize: normalizeMaxTeamSize(input.maxTeamSize),
        createdBy: actor.userId,
      }).returning();

      await tx.insert(schema.eventMemberships).values({
        eventId: created.id,
        userId: actor.userId,
        role: "ORGANIZER",
      });
      // Recorded for the audit trail; no webhook endpoint can exist yet.
      await appendAuditEvent(tx, {
        eventId: created.id,
        actorId: actor.userId,
        action: "event.create",
        resourceType: "event",
        resourceId: created.id,
        metadata: { slug: created.slug, name: created.name },
      });

      return created;
    });
  } catch (err) {
    if (sqlState(err) === "23505") {
      const existing = await db
        .select({
          state: schema.events.state,
          createdBy: schema.events.createdBy,
          ownerEmail: schema.users.email,
        })
        .from(schema.events)
        .innerJoin(schema.users, eq(schema.users.id, schema.events.createdBy))
        .where(eq(schema.events.slug, input.slug))
        .limit(1);
      const row = existing[0];
      if (row && row.state === "ARCHIVED") {
        const message =
          row.createdBy === actor.userId
            ? `You archived an event with the slug "${input.slug}". Find it in the events list and choose Unarchive, or pick another slug.`
            : `An archived event with the slug "${input.slug}" already exists under ${row.ownerEmail}. Log in with that account to reopen it, or pick another slug.`;
        throw new DogfoodError("SLUG_TAKEN", message);
      }
      throw new DogfoodError(
        "SLUG_TAKEN",
        `An event with the slug "${input.slug}" already exists. Pick another slug.`,
      );
    }
    throw err;
  }
}

export type RegistrationWindowInput = {
  registrationOpensAt?: Date | null;
  registrationClosesAt?: Date | null;
};

export async function updateEventRegistrationWindow(
  actor: Actor,
  eventId: string,
  input: RegistrationWindowInput,
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
    ACTION.EVENT_CONFIGURE,
  );

  const registrationOpensAt = toNullableDate(input.registrationOpensAt);
  const registrationClosesAt = toNullableDate(input.registrationClosesAt);
  if (
    registrationOpensAt &&
    registrationClosesAt &&
    registrationOpensAt >= registrationClosesAt
  ) {
    throw new DogfoodError(
      "VALIDATION_FAILED",
      "[VALIDATION_FAILED] Registration open must be earlier than close",
    );
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.events)
      .set({
        registrationOpensAt,
        registrationClosesAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.events.id, eventId))
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "event.registration_window",
      resourceType: "event",
      resourceId: event.id,
      metadata: {
        opensAt: registrationOpensAt?.toISOString() ?? null,
        closesAt: registrationClosesAt?.toISOString() ?? null,
      },
    });
    return row;
  });
  return updated;
}

export type EventDetailsInput = {
  description?: string | null;
  websiteUrl?: string | null;
  prizeInfo?: string | null;
  timeline?: string | null;
  schedule?: string | null;
  rules?: string | null;
  maxTeamSize?: number | null;
};

export async function updateEventDetails(
  actor: Actor,
  eventId: string,
  input: EventDetailsInput,
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
    ACTION.EVENT_CONFIGURE,
  );

  const patch = {
    description: normalizeText(input.description),
    websiteUrl: normalizeWebsiteUrl(input.websiteUrl),
    prizeInfo: normalizeText(input.prizeInfo),
    timeline: normalizeText(input.timeline),
    schedule: normalizeText(input.schedule),
    rules: normalizeText(input.rules),
    maxTeamSize: normalizeMaxTeamSize(input.maxTeamSize),
  };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(schema.events)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.events.id, eventId))
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "event.details",
      resourceType: "event",
      resourceId: event.id,
      metadata: {
        websiteUrl: patch.websiteUrl,
        maxTeamSize: patch.maxTeamSize,
        hasPrize: Boolean(patch.prizeInfo),
        hasTimeline: Boolean(patch.timeline),
        hasSchedule: Boolean(patch.schedule),
        hasRules: Boolean(patch.rules),
      },
    });
    return row;
  });
}

export type EventSearchInput = {
  q?: string | null;
  state?: EventState | null;
  limit?: number;
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listEvents(
  actor: Actor | null,
  input: EventSearchInput = {},
): Promise<EventRow[]> {
  const conditions: SQL[] = [];

  const isMemberOfEvent = sql`exists (
    select 1 from ${schema.eventMemberships} where ${schema.eventMemberships.eventId} = ${schema.events.id} and ${schema.eventMemberships.userId} = ${actor?.userId ?? "00000000-0000-0000-0000-000000000000"} and ${schema.eventMemberships.isActive} = true
  )`;

  if (actor && actor.isPlatformAdmin) {
    conditions.push(ne(schema.events.state, "ARCHIVED"));
  } else if (actor) {
    conditions.push(
      or(
        ne(schema.events.state, "DRAFT"),
        eq(schema.events.createdBy, actor.userId),
        isMemberOfEvent,
      )!,
      or(
        ne(schema.events.state, "ARCHIVED"),
        eq(schema.events.createdBy, actor.userId),
      )!,
    );
  } else {
    conditions.push(
      ne(schema.events.state, "DRAFT"),
      ne(schema.events.state, "ARCHIVED"),
    );
  }

  const search = input.q?.trim() ?? "";
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    conditions.push(
      or(
        ilike(schema.events.name, pattern),
        ilike(schema.events.slug, pattern),
        ilike(schema.events.description, pattern),
      )!,
    );
  }

  if (input.state) conditions.push(eq(schema.events.state, input.state));

  const requestedLimit = input.limit ?? 100;
  const limit = Math.min(Math.max(requestedLimit, 1), 500);

  return db
    .select()
    .from(schema.events)
    .where(and(...conditions))
    .orderBy(desc(schema.events.createdAt))
    .limit(limit);
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

    const members = await tx
      .select({ userId: schema.eventMemberships.userId })
      .from(schema.eventMemberships)
      .where(
        and(
          eq(schema.eventMemberships.eventId, eventId),
          eq(schema.eventMemberships.isActive, true),
        ),
      );
    const actorName = await actorDisplayName(tx, actor.userId);
    await notifyMany(
      tx,
      members.map((m) => m.userId).filter((id) => id !== actor.userId),
      {
        eventId,
        type: "event_state_changed",
        title: `${event.name} moved to ${toState.toLowerCase().replace(/_/g, " ")}`,
        body: `${actorName} advanced the event from ${event.state.toLowerCase().replace(/_/g, " ")}.`,
        href: `/events/${eventId}`,
      },
    );
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
    .select({ state: schema.events.state, name: schema.events.name })
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

    let membership: MembershipRow;
    if (current) {
      if (current.role === role) {
        membership = current;
      } else {
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
        membership = updated;
      }
    } else {
      const [created] = await tx
        .insert(schema.eventMemberships)
        .values({ eventId, userId, role })
        .returning();
      membership = created;
    }

    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "event.member.grant",
      resourceType: "event_membership",
      resourceId: membership.id,
      metadata: { grantedUserId: userId, role },
    });

    if (userId !== actor.userId) {
      const previousRole = current?.role ?? null;
      const actorName = await actorDisplayName(tx, actor.userId);
      await notify(tx, {
        userId,
        eventId,
        type: role === "JUDGE" ? "judge_added" : "role_changed",
        title:
          role === "JUDGE"
            ? `You are now a judge for ${event.name}`
            : `Your role for ${event.name} is now ${role.toLowerCase()}`,
        body:
          previousRole && previousRole !== role
            ? `${actorName} changed your role from ${previousRole.toLowerCase()} to ${role.toLowerCase()}.`
            : `${actorName} added you to ${event.name}.`,
        href: `/events/${eventId}/judge`,
      });
    }

    return membership;
  });
}

export async function joinEvent(
  actor: Actor,
  eventId: string,
): Promise<MembershipRow> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = rows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.EVENT_JOIN,
  );

  if (event.state !== "REGISTRATION") {
    throw new DogfoodError(
      "REGISTRATION_CLOSED",
      "Registration for this event is not open",
    );
  }

  const now = new Date();
  if (event.registrationOpensAt && now < event.registrationOpensAt) {
    throw new DogfoodError(
      "REGISTRATION_CLOSED",
      "Registration for this event has not opened yet",
    );
  }
  if (event.registrationClosesAt && now > event.registrationClosesAt) {
    throw new DogfoodError(
      "REGISTRATION_CLOSED",
      "Registration for this event has closed",
    );
  }

  const existing = await db
    .select()
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.userId, actor.userId),
      ),
    )
    .limit(1);
  const current = existing[0];
  if (current) {
    if (current.role === "PARTICIPANT") return current;
    throw new DogfoodError(
      "FORBIDDEN",
      `You already hold the ${current.role.toLowerCase()} role for this event`,
    );
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(schema.eventMemberships)
      .values({ eventId, userId: actor.userId, role: "PARTICIPANT" })
      .returning();
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "event.join",
      resourceType: "event_membership",
      resourceId: created.id,
      metadata: { role: "PARTICIPANT" },
    });
    return created;
  });
}

export async function removeEventMembership(
  actor: Actor,
  eventId: string,
  userId: string,
): Promise<void> {
  const rows = await db
    .select({ state: schema.events.state, name: schema.events.name })
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = rows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  await requireEventPermission(
    actor,
    eventId,
    event.state as EventState,
    ACTION.MEMBER_REMOVE,
  );

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
    const membership = existing[0];
    if (!membership) {
      throw new DogfoodError("NOT_FOUND", "User is not a member of this event");
    }

    if (membership.role === "ORGANIZER") {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(schema.eventMemberships)
        .where(
          and(
            eq(schema.eventMemberships.eventId, eventId),
            eq(schema.eventMemberships.role, "ORGANIZER"),
          ),
        );
      if (n <= 1) {
        throw new DogfoodError(
          "FORBIDDEN",
          "Cannot remove the last organizer of an event",
        );
      }
    }

    await tx
      .delete(schema.eventMemberships)
      .where(eq(schema.eventMemberships.id, membership.id));
    await appendAuditEvent(tx, {
      eventId,
      actorId: actor.userId,
      action: "event.member.remove",
      resourceType: "event_membership",
      resourceId: membership.id,
      metadata: { removedUserId: userId, role: membership.role },
    });

    if (userId !== actor.userId) {
      const actorName = await actorDisplayName(tx, actor.userId);
      await notify(tx, {
        userId,
        eventId,
        type: membership.role === "JUDGE" ? "judge_removed" : "role_changed",
        title: `You were removed from ${event.name}`,
        body: `${actorName} removed your ${membership.role.toLowerCase()} role for this event.`,
        href: `/events/${eventId}`,
      });
    }
  });
}
