import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { and, db, eq, isNull, schema } from "@dogfood/db";
import { createEvent, grantEventMembership } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as certificatesRoute from "../../apps/web/app/api/v1/events/[eventId]/certificates/route";
import * as notificationReadRoute from "../../apps/web/app/api/v1/notifications/[notificationId]/read/route";
import * as notificationsReadRoute from "../../apps/web/app/api/v1/notifications/read/route";

const BASE = "http://dogfood.local";

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

async function seedAuthUser(email: string) {
  const user = await registerUser({ email, password: "password123", displayName: email });
  const session = await createSession(user.id);
  const actor: Actor = { userId: user.id, isPlatformAdmin: false };
  return { userId: user.id, actor, cookie: `dogfood_session=${session.rawToken}` };
}

function request(method: string, path: string, cookie?: string): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${BASE}${path}`, { method, headers });
}

type RouteHandler = (
  request: Request,
  ctx: { params: Promise<any> },
) => Promise<Response>;

async function invoke(
  handler: RouteHandler,
  req: Request,
  params: Record<string, string> = {},
): Promise<{ res: Response; body: Record<string, any> }> {
  const res = await handler(req, { params: Promise.resolve(params) });
  return { res, body: await res.json() };
}

describe("organizer and notification action APIs", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("revokes event certificates once, records audit state, and denies non-organizers", async () => {
    const organizer = await seedAuthUser(uniqueEmail("certificate-owner"));
    const participant = await seedAuthUser(uniqueEmail("certificate-participant"));
    const event = await createEvent(organizer.actor, {
      name: "Certificate Revocation API",
      slug: `certificate-revoke-${Date.now()}`,
      timezone: "UTC",
    });
    await grantEventMembership(organizer.actor, event.id, participant.userId, "PARTICIPANT");
    await db.insert(schema.certificates).values({
      eventId: event.id,
      userId: participant.userId,
      displayName: "Certificate Recipient",
      projectTitle: "Test Project",
      tier: "participation",
      issuedBy: organizer.userId,
    });

    const path = `/api/v1/events/${event.id}/certificates`;
    const unauthenticated = await invoke(
      certificatesRoute.DELETE,
      request("DELETE", path),
      { eventId: event.id },
    );
    expect(unauthenticated.res.status).toBe(401);

    const denied = await invoke(
      certificatesRoute.DELETE,
      request("DELETE", path, participant.cookie),
      { eventId: event.id },
    );
    expect(denied.res.status).toBe(403);
    expect(denied.body.error.code).toBe("FORBIDDEN");
    expect(
      await db.select().from(schema.certificates).where(eq(schema.certificates.eventId, event.id)),
    ).toHaveLength(1);

    const revoked = await invoke(
      certificatesRoute.DELETE,
      request("DELETE", path, organizer.cookie),
      { eventId: event.id },
    );
    expect(revoked.res.status).toBe(200);
    expect(revoked.body).toEqual({ revoked: 1 });

    const repeated = await invoke(
      certificatesRoute.DELETE,
      request("DELETE", path, organizer.cookie),
      { eventId: event.id },
    );
    expect(repeated.res.status).toBe(200);
    expect(repeated.body).toEqual({ revoked: 0 });
    expect(
      await db.select().from(schema.certificates).where(eq(schema.certificates.eventId, event.id)),
    ).toHaveLength(0);

    const audit = await db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.action, "certificate.revoke"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      eventId: event.id,
      actorId: organizer.userId,
      resourceType: "certificate",
      metadata: { revoked: 1 },
    });
  });

  it("marks only the owner's notification as read and keeps retries idempotent", async () => {
    const owner = await seedAuthUser(uniqueEmail("notification-owner"));
    const otherUser = await seedAuthUser(uniqueEmail("notification-other"));
    const [notification] = await db.insert(schema.notifications).values({
      userId: owner.userId,
      type: "results_published",
      title: "Results are ready",
    }).returning();
    const [otherNotification] = await db.insert(schema.notifications).values({
      userId: otherUser.userId,
      type: "results_published",
      title: "Other user's results are ready",
    }).returning();

    const path = `/api/v1/notifications/${notification.id}/read`;
    const unauthenticated = await invoke(
      notificationReadRoute.POST,
      request("POST", path),
      { notificationId: notification.id },
    );
    expect(unauthenticated.res.status).toBe(401);

    const denied = await invoke(
      notificationReadRoute.POST,
      request("POST", path, otherUser.cookie),
      { notificationId: notification.id },
    );
    expect(denied.res.status).toBe(404);
    expect(denied.body.error.code).toBe("NOT_FOUND");

    const read = await invoke(
      notificationReadRoute.POST,
      request("POST", path, owner.cookie),
      { notificationId: notification.id },
    );
    expect(read.res.status).toBe(200);
    expect(read.body).toEqual({ read: true });
    const [firstState] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(firstState.readAt).toBeInstanceOf(Date);

    const repeated = await invoke(
      notificationReadRoute.POST,
      request("POST", path, owner.cookie),
      { notificationId: notification.id },
    );
    expect(repeated.res.status).toBe(200);
    const [repeatedState] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, notification.id));
    expect(repeatedState.readAt?.getTime()).toBe(firstState.readAt?.getTime());

    const [additionalNotification] = await db.insert(schema.notifications).values({
      userId: owner.userId,
      type: "certificate_issued",
      title: "Certificate issued",
    }).returning();
    const markAll = await invoke(
      notificationsReadRoute.POST,
      request("POST", "/api/v1/notifications/read", owner.cookie),
    );
    expect(markAll.res.status).toBe(200);
    const unread = await db
      .select({ id: schema.notifications.id })
      .from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, owner.userId),
        isNull(schema.notifications.readAt),
      ));
    expect(unread).toHaveLength(0);
    const [markedAllState] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, additionalNotification.id));
    expect(markedAllState.readAt).toBeInstanceOf(Date);
    const [otherState] = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.id, otherNotification.id));
    expect(otherState.readAt).toBeNull();
  });
});
