import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendAuditEvent,
  createWebhookEndpoint,
  dispatchDueWebhookDeliveries,
  listWebhookEndpoints,
  verifyWebhookSignature,
} from "@dogfood/audit";
import { registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";

function actorFor(userId: string): Actor {
  return { userId, isPlatformAdmin: false };
}

describe("event webhooks", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("queues audited mutations in the same transaction and delivers a signed payload", async () => {
    const organizer = await registerUser({
      email: "webhooks-organizer@example.com",
      password: "password123",
      displayName: "Organizer",
    });
    const actor = actorFor(organizer.id);
    const event = await createEvent(actor, {
      slug: "webhooks-event",
      name: "Webhook Event",
      timezone: "UTC",
    });
    const { endpoint, signingSecret } = await createWebhookEndpoint(actor, event.id, {
      url: "https://hooks.example.com/dogfood",
      eventTypes: ["*"],
    });

    await db.transaction(async (tx) => {
      await appendAuditEvent(tx, {
        eventId: event.id,
        actorId: actor.userId,
        action: "project.submit",
        resourceType: "project",
        metadata: { title: "Harborlight" },
      });
    });

    const queued = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id));
    expect(queued).toHaveLength(1);
    expect((await listWebhookEndpoints(actor, event.id))[0]).not.toHaveProperty("secret");
    await expect(db.transaction(async (tx) => {
      await appendAuditEvent(tx, {
        eventId: event.id,
        actorId: actor.userId,
        action: "project.submit",
        resourceType: "project",
      });
      throw new Error("roll back business mutation");
    })).rejects.toThrow("roll back business mutation");
    expect(await db.select().from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id))).toHaveLength(1);

    const send = vi.fn(async () => ({ status: 202 }));
    const result = await dispatchDueWebhookDeliveries(actor, event.id, { send });
    expect(result).toMatchObject({ delivered: 1, retried: 0, dead: 0 });
    expect(send).toHaveBeenCalledOnce();
    const attempt = send.mock.calls[0]?.[0];
    expect(attempt?.url).toBe("https://hooks.example.com/dogfood");
    expect(attempt?.headers["X-Dogfood-Event"]).toBe("project.submit");
    const signedHeader = attempt?.headers["X-Dogfood-Signature"] ?? "";
    expect(signedHeader).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    const [, timestamp, digest] = signedHeader.match(/^t=(\d+),v1=([a-f0-9]{64})$/) ?? [];
    expect(verifyWebhookSignature(signingSecret, timestamp ?? "", attempt?.body ?? "", `v1=${digest}`)).toBe(true);
    expect(verifyWebhookSignature(signingSecret, timestamp ?? "", `${attempt?.body ?? ""} `, `v1=${digest}`)).toBe(false);
    expect(JSON.parse(attempt?.body ?? "{}")).toMatchObject({
      eventId: event.id,
      type: "project.submit",
      data: { title: "Harborlight" },
    });

    const delivered = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id));
    expect(delivered[0]).toMatchObject({ status: "DELIVERED", attemptCount: 1, lastStatusCode: 202 });
    expect(signingSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("records failures and schedules a bounded retry without failing the mutation", async () => {
    const organizer = await registerUser({
      email: "webhooks-retry@example.com",
      password: "password123",
      displayName: "Organizer",
    });
    const actor = actorFor(organizer.id);
    const event = await createEvent(actor, {
      slug: "webhooks-retry-event",
      name: "Webhook Retry Event",
      timezone: "UTC",
    });
    const { endpoint } = await createWebhookEndpoint(actor, event.id, {
      url: "https://hooks.example.com/retry",
      eventTypes: ["project.submit"],
    });
    await db.transaction((tx) => appendAuditEvent(tx, {
      eventId: event.id,
      actorId: actor.userId,
      action: "project.submit",
      resourceType: "project",
    }));

    const pendingBeforeDispatch = await db.select().from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id));
    expect(pendingBeforeDispatch).toHaveLength(1);

    const failed = await dispatchDueWebhookDeliveries(actor, event.id, {
      send: async () => { throw new Error("receiver unavailable"); },
    });
    expect(failed).toMatchObject({ delivered: 0, retried: 1, dead: 0 });
    const [delivery] = await db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id));
    expect(delivery).toMatchObject({ status: "RETRY", attemptCount: 1, lastError: "receiver unavailable" });
    expect(delivery?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

    await db.update(schema.webhookDeliveries)
      .set({ attemptCount: 7, nextAttemptAt: new Date(Date.now() - 1_000) })
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id));
    const exhausted = await dispatchDueWebhookDeliveries(actor, event.id, {
      send: async () => { throw new Error("still unavailable"); },
    });
    expect(exhausted).toMatchObject({ delivered: 0, retried: 0, dead: 1 });
    const [deadDelivery] = await db.select().from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpoint.id));
    expect(deadDelivery).toMatchObject({ status: "DEAD", attemptCount: 8 });
  });

  it("rejects local and metadata targets before they can be configured", async () => {
    const organizer = await registerUser({
      email: "webhooks-ssrf@example.com",
      password: "password123",
      displayName: "Organizer",
    });
    const actor = actorFor(organizer.id);
    const event = await createEvent(actor, {
      slug: "webhooks-ssrf-event",
      name: "Webhook SSRF Event",
      timezone: "UTC",
    });
    for (const url of [
      "https://127.0.0.1/hook",
      "https://[::1]/hook",
      "https://metadata.google.internal/latest/meta-data/",
      "https://receiver.local/hook",
    ]) {
      await expect(createWebhookEndpoint(actor, event.id, { url, eventTypes: ["*"] }))
        .rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    }

    const stranger = await registerUser({
      email: "webhooks-stranger@example.com",
      password: "password123",
      displayName: "Stranger",
    });
    await expect(listWebhookEndpoints(actorFor(stranger.id), event.id))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
