import { and, db, desc, eq, schema, type DbTx } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { queueWebhookDeliveries } from "./webhooks";

export type AuditEventInput = {
  eventId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AuditEventFilter = {
  limit?: number;
  resourceType?: string;
};

type AuditEventRow = typeof schema.auditEvents.$inferSelect;

async function appendAuditEvent(
  tx: DbTx,
  input: AuditEventInput,
): Promise<void> {
  const [auditEvent] = await tx.insert(schema.auditEvents).values({
    eventId: input.eventId,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId ?? null,
    metadata: input.metadata ?? null,
  }).returning();
  if (auditEvent) await queueWebhookDeliveries(tx, auditEvent);
}

async function queryAudit(
  actor: Actor,
  eventId: string,
  filter: AuditEventFilter = {},
): Promise<AuditEventRow[]> {
  const rows = await db
    .select()
    .from(schema.events)
    .where(eq(schema.events.id, eventId))
    .limit(1);
  const event = rows[0];
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");

  const membership = await db
    .select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.userId, actor.userId),
        eq(schema.eventMemberships.eventId, eventId),
        eq(schema.eventMemberships.isActive, true),
      ),
    );
  requirePermission(actor, ACTION.READ_AUDIT, {
    eventId,
    resourceEventId: eventId,
    roles: membership.map((row) => row.role),
    eventState: event.state,
  });

  const conditions = [eq(schema.auditEvents.eventId, eventId)];
  if (filter.resourceType) {
    conditions.push(eq(schema.auditEvents.resourceType, filter.resourceType));
  }

  return db
    .select()
    .from(schema.auditEvents)
    .where(and(...conditions))
    .orderBy(desc(schema.auditEvents.createdAt))
    .limit(filter.limit ?? 50);
}

export { appendAuditEvent, queryAudit };
export type { AuditEventRow };
