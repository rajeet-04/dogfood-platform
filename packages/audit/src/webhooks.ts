import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
// Circular with ./service, which is safe: both sides only call each other at runtime.
import { appendAuditEvent } from "./service";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";

import {
  and,
  db,
  desc,
  eq,
  or,
  sql,
  schema,
  type DbTx,
} from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

const MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000, 1_800_000, 3_600_000, 21_600_000, 86_400_000];

export type CreateWebhookEndpointInput = {
  url: string;
  eventTypes: string[];
};

export type WebhookSendInput = {
  url: string;
  secret: string;
  deliveryId: string;
  eventType: string;
  body: string;
  headers: Record<string, string>;
};

export type WebhookSend = (input: WebhookSendInput) => Promise<{ status: number }>;

function normalizeUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new DogfoodError("VALIDATION_FAILED", "Webhook URL must be a valid HTTPS URL");
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    (url.port !== "" && url.port !== "443") ||
    url.username ||
    url.password ||
    isIP(hostname) !== 0 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "metadata.google.internal" ||
    hostname === "metadata"
  ) {
    throw new DogfoodError("VALIDATION_FAILED", "Webhook URL must use public HTTPS on port 443");
  }
  url.hash = "";
  return url.toString();
}

function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b! >= 64 && b! <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b! >= 16 && b! <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a! >= 224
    );
  }
  if (family === 6) {
    const lower = address.toLowerCase();
    // Public IPv6 unicast is 2000::/3; this intentionally rejects special ranges.
    return /^(?:2|3)/.test(lower) && !lower.startsWith("2001:db8:");
  }
  return false;
}

async function resolvePublicTarget(value: string): Promise<{ url: URL; address: string; family: number }> {
  const normalized = normalizeUrl(value);
  const url = new URL(normalized);
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
    throw new Error("Webhook host resolves to a non-public address");
  }
  return { url, address: addresses[0]!.address, family: addresses[0]!.family };
}

function signature(secret: string, timestamp: string, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function verifyWebhookSignature(
  secret: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): boolean {
  const supplied = signatureHeader.match(/(?:^|,)v1=([a-f0-9]{64})(?:,|$)/)?.[1];
  if (!supplied || !/^\d+$/.test(timestamp)) return false;
  const expected = signature(secret, timestamp, body);
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

async function sendWebhook(input: WebhookSendInput): Promise<{ status: number }> {
  const target = await resolvePublicTarget(input.url);
  return new Promise((resolve, reject) => {
    const request = https.request(target.url, {
      method: "POST",
      headers: input.headers,
      timeout: 8_000,
      // Pin the socket to the address vetted above to close the DNS-rebinding gap.
      lookup: (_hostname, _options, callback) => callback(null, target.address, target.family),
    }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode ?? 0 }));
    });
    request.on("timeout", () => request.destroy(new Error("Webhook request timed out")));
    request.on("error", reject);
    request.end(input.body);
  });
}

async function requireOrganizer(actor: Actor, eventId: string): Promise<void> {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const memberships = await db.select({ role: schema.eventMemberships.role })
    .from(schema.eventMemberships)
    .where(and(eq(schema.eventMemberships.eventId, eventId), eq(schema.eventMemberships.userId, actor.userId), eq(schema.eventMemberships.isActive, true)));
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId,
    resourceEventId: eventId,
    roles: memberships.map((row) => row.role),
    eventState: event.state,
  });
}

function publicEndpoint(row: typeof schema.webhookEndpoints.$inferSelect) {
  const { secret: _secret, ...endpoint } = row;
  return endpoint;
}

export async function createWebhookEndpoint(
  actor: Actor,
  eventId: string,
  input: CreateWebhookEndpointInput,
) {
  await requireOrganizer(actor, eventId);
  const url = normalizeUrl(input.url);
  const eventTypes = [...new Set(input.eventTypes.map((type) => type.trim()).filter(Boolean))];
  if (!eventTypes.length || eventTypes.length > 64 || eventTypes.some((type) => type !== "*" && !/^[a-z][a-z0-9_.-]{1,95}$/.test(type))) {
    throw new DogfoodError("VALIDATION_FAILED", "Choose between 1 and 64 valid event types");
  }
  if (eventTypes.includes("*") && eventTypes.length !== 1) {
    throw new DogfoodError("VALIDATION_FAILED", "Wildcard subscription must be used by itself");
  }
  const secret = randomBytes(32).toString("base64url");
  const id = randomUUID();
  const row = await db.transaction(async (tx) => {
    // Audit first so existing endpoints hear about the new one, but the new
    // endpoint is not sent its own creation.
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "webhook.create", resourceType: "webhook_endpoint", resourceId: id, metadata: { url, eventTypes } });
    const [inserted] = await tx.insert(schema.webhookEndpoints).values({
      id,
      eventId,
      createdBy: actor.userId,
      url,
      secret,
      eventTypes,
    }).returning();
    if (!inserted) throw new Error("Webhook endpoint insert returned no row");
    return inserted;
  });
  return { endpoint: publicEndpoint(row), signingSecret: secret };
}

export async function listWebhookEndpoints(actor: Actor, eventId: string) {
  await requireOrganizer(actor, eventId);
  const rows = await db.select().from(schema.webhookEndpoints)
    .where(eq(schema.webhookEndpoints.eventId, eventId))
    .orderBy(schema.webhookEndpoints.createdAt);
  return rows.map(publicEndpoint);
}

export async function updateWebhookEndpoint(
  actor: Actor,
  eventId: string,
  endpointId: string,
  input: { enabled?: boolean; rotateSecret?: boolean },
) {
  await requireOrganizer(actor, eventId);
  if (input.enabled === undefined && !input.rotateSecret) {
    throw new DogfoodError("VALIDATION_FAILED", "Provide enabled or rotateSecret");
  }
  const [existing] = await db.select().from(schema.webhookEndpoints)
    .where(and(eq(schema.webhookEndpoints.eventId, eventId), eq(schema.webhookEndpoints.id, endpointId))).limit(1);
  if (!existing) throw new DogfoodError("NOT_FOUND", "Webhook endpoint not found");
  const secret = input.rotateSecret ? randomBytes(32).toString("base64url") : existing.secret;
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(schema.webhookEndpoints).set({
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.rotateSecret ? { secret } : {}),
    }).where(eq(schema.webhookEndpoints.id, endpointId)).returning();
    if (!updated) throw new Error("Webhook endpoint update returned no row");
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "webhook.update", resourceType: "webhook_endpoint", resourceId: endpointId, metadata: { enabled: updated.enabled, rotatedSecret: Boolean(input.rotateSecret) } });
    return updated;
  });
  return { endpoint: publicEndpoint(row), ...(input.rotateSecret ? { signingSecret: secret } : {}) };
}

export async function deleteWebhookEndpoint(actor: Actor, eventId: string, endpointId: string): Promise<void> {
  await requireOrganizer(actor, eventId);
  await db.transaction(async (tx) => {
    const rows = await tx.delete(schema.webhookEndpoints)
      .where(and(eq(schema.webhookEndpoints.eventId, eventId), eq(schema.webhookEndpoints.id, endpointId)))
      .returning({ id: schema.webhookEndpoints.id, url: schema.webhookEndpoints.url });
    if (!rows.length) throw new DogfoodError("NOT_FOUND", "Webhook endpoint not found");
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "webhook.delete", resourceType: "webhook_endpoint", resourceId: endpointId, metadata: { url: rows[0].url } });
  });
}

export async function queueWebhookDeliveries(
  tx: DbTx,
  event: typeof schema.auditEvents.$inferSelect,
): Promise<void> {
  const endpoints = await tx.select({ id: schema.webhookEndpoints.id, eventTypes: schema.webhookEndpoints.eventTypes })
    .from(schema.webhookEndpoints)
    .where(and(
      eq(schema.webhookEndpoints.eventId, event.eventId),
      eq(schema.webhookEndpoints.enabled, true),
    ));
  const matches = endpoints.filter((endpoint) => endpoint.eventTypes.includes("*") || endpoint.eventTypes.includes(event.action));
  if (!matches.length) return;
  await tx.insert(schema.webhookDeliveries).values(matches.map((endpoint) => ({
    endpointId: endpoint.id,
    auditEventId: event.id,
  }))).onConflictDoNothing();
}

export async function listWebhookDeliveries(actor: Actor, eventId: string) {
  await requireOrganizer(actor, eventId);
  const rows = await db.select({
    id: schema.webhookDeliveries.id,
    endpointId: schema.webhookDeliveries.endpointId,
    eventType: schema.auditEvents.action,
    status: schema.webhookDeliveries.status,
    attemptCount: schema.webhookDeliveries.attemptCount,
    nextAttemptAt: schema.webhookDeliveries.nextAttemptAt,
    lastStatusCode: schema.webhookDeliveries.lastStatusCode,
    lastError: schema.webhookDeliveries.lastError,
    deliveredAt: schema.webhookDeliveries.deliveredAt,
    createdAt: schema.webhookDeliveries.createdAt,
  }).from(schema.webhookDeliveries)
    .innerJoin(schema.webhookEndpoints, eq(schema.webhookDeliveries.endpointId, schema.webhookEndpoints.id))
    .innerJoin(schema.auditEvents, eq(schema.webhookDeliveries.auditEventId, schema.auditEvents.id))
    .where(eq(schema.webhookEndpoints.eventId, eventId))
    .orderBy(desc(schema.webhookDeliveries.createdAt));
  return rows;
}

export async function dispatchDueWebhookDeliveries(
  actor: Actor,
  eventId: string,
  options: { limit?: number; send?: WebhookSend } = {},
) {
  await requireOrganizer(actor, eventId);
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const send = options.send ?? sendWebhook;
  const counts = { delivered: 0, retried: 0, dead: 0, attempted: 0 };

  for (let index = 0; index < limit; index += 1) {
    const claim = await db.transaction(async (tx) => {
      const now = new Date();
      const rows = await tx.select({ delivery: schema.webhookDeliveries })
        .from(schema.webhookDeliveries)
        .innerJoin(schema.webhookEndpoints, eq(schema.webhookDeliveries.endpointId, schema.webhookEndpoints.id))
        .where(and(
          eq(schema.webhookEndpoints.eventId, eventId),
          eq(schema.webhookEndpoints.enabled, true),
          or(
            and(or(eq(schema.webhookDeliveries.status, "PENDING"), eq(schema.webhookDeliveries.status, "RETRY")), sql`${schema.webhookDeliveries.nextAttemptAt} <= now()`),
            and(eq(schema.webhookDeliveries.status, "DELIVERING"), sql`${schema.webhookDeliveries.lockedUntil} <= now()`),
          ),
        ))
        .orderBy(schema.webhookDeliveries.nextAttemptAt)
        .limit(1)
        .for("update", { skipLocked: true });
      const delivery = rows[0]?.delivery;
      if (!delivery) return null;
      const [endpoint] = await tx.select().from(schema.webhookEndpoints)
        .where(eq(schema.webhookEndpoints.id, delivery.endpointId)).limit(1);
      const [auditEvent] = await tx.select().from(schema.auditEvents)
        .where(eq(schema.auditEvents.id, delivery.auditEventId)).limit(1);
      if (!endpoint || !auditEvent) return null;
      const attemptCount = delivery.attemptCount + 1;
      await tx.update(schema.webhookDeliveries).set({
        status: "DELIVERING",
        attemptCount,
        lockedUntil: new Date(now.getTime() + 30_000),
        lastAttemptAt: now,
      }).where(eq(schema.webhookDeliveries.id, delivery.id));
      return { delivery: { ...delivery, attemptCount }, endpoint, auditEvent };
    });
    if (!claim) break;
    counts.attempted += 1;

    const { delivery, endpoint, auditEvent } = claim;
    const payload = {
      id: auditEvent.id,
      eventId: auditEvent.eventId,
      type: auditEvent.action,
      createdAt: auditEvent.createdAt.toISOString(),
      actorId: auditEvent.actorId,
      resource: { type: auditEvent.resourceType, id: auditEvent.resourceId },
      data: auditEvent.metadata,
    };
    const body = JSON.stringify(payload);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signatureHeader = `t=${timestamp},v1=${signature(endpoint.secret, timestamp, body)}`;
    let statusCode: number | null = null;
    let errorMessage: string | null = null;
    try {
      const result = await send({
        url: endpoint.url,
        secret: endpoint.secret,
        deliveryId: delivery.id,
        eventType: auditEvent.action,
        body,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "DOGFOOD-Webhooks/1.0",
          "X-Dogfood-Delivery": delivery.id,
          "X-Dogfood-Event": auditEvent.action,
          "X-Dogfood-Signature": signatureHeader,
        },
      });
      statusCode = result.status;
      if (statusCode < 200 || statusCode >= 300) errorMessage = `Receiver returned HTTP ${statusCode}`;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed";
    }

    const now = new Date();
    if (!errorMessage) {
      await db.update(schema.webhookDeliveries).set({
        status: "DELIVERED",
        lockedUntil: null,
        lastStatusCode: statusCode,
        lastError: null,
        deliveredAt: now,
      }).where(eq(schema.webhookDeliveries.id, delivery.id));
      counts.delivered += 1;
    } else {
      const dead = delivery.attemptCount >= MAX_ATTEMPTS;
      const delay = RETRY_DELAYS_MS[Math.min(delivery.attemptCount - 1, RETRY_DELAYS_MS.length - 1)]!;
      await db.update(schema.webhookDeliveries).set({
        status: dead ? "DEAD" : "RETRY",
        lockedUntil: null,
        nextAttemptAt: new Date(now.getTime() + delay),
        lastStatusCode: statusCode,
        lastError: errorMessage,
      }).where(eq(schema.webhookDeliveries.id, delivery.id));
      counts[dead ? "dead" : "retried"] += 1;
    }
  }
  return counts;
}
