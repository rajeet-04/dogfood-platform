import {
  and,
  db,
  desc,
  eq,
  inArray,
  isNull,
  schema,
  type DbTx,
} from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

export type NotifyInput = {
  userId: string;
  eventId?: string | null;
  type: (typeof schema.NOTIFICATION_TYPES)[number];
  title: string;
  body?: string | null;
  href?: string | null;
};

export type NotificationListItem = {
  id: string;
  eventId: string | null;
  type: (typeof schema.NOTIFICATION_TYPES)[number];
  title: string;
  body: string | null;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export type NotificationInbox = {
  items: NotificationListItem[];
  unreadCount: number;
};

const MAX_INBOX = 20;

export async function notify(
  tx: DbTx,
  input: NotifyInput,
): Promise<void> {
  await tx.insert(schema.notifications).values({
    userId: input.userId,
    eventId: input.eventId ?? null,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    href: input.href ?? null,
  });
}

export async function notifyMany(
  tx: DbTx,
  userIds: string[],
  input: Omit<NotifyInput, "userId">,
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return;
  await tx.insert(schema.notifications).values(
    unique.map((userId) => ({
      userId,
      eventId: input.eventId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
    })),
  );
}

export async function notifyEventMembersByRole(
  tx: DbTx,
  eventId: string,
  roles: string[],
  input: Omit<NotifyInput, "userId" | "eventId">,
  options: { excludeUserIds?: string[] } = {},
): Promise<void> {
  if (roles.length === 0) return;
  const rows = await tx
    .select({ userId: schema.eventMemberships.userId })
    .from(schema.eventMemberships)
    .where(
      and(
        eq(schema.eventMemberships.eventId, eventId),
        inArray(schema.eventMemberships.role, roles as never[]),
        eq(schema.eventMemberships.isActive, true),
      ),
    );
  const exclude = new Set(options.excludeUserIds ?? []);
  await notifyMany(
    tx,
    rows.map((r) => r.userId).filter((id) => !exclude.has(id)),
    { ...input, eventId },
  );
}

export async function actorDisplayName(
  tx: DbTx,
  userId: string,
): Promise<string> {
  const rows = await tx
    .select({ displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return rows[0]?.displayName ?? "Someone";
}

export async function getInbox(actor: Actor): Promise<NotificationInbox> {  const items = await db
    .select()
    .from(schema.notifications)
    .where(eq(schema.notifications.userId, actor.userId))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(MAX_INBOX);

  const unread = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.userId, actor.userId),
        isNull(schema.notifications.readAt),
      ),
    );

  return {
    items,
    unreadCount: unread.length,
  };
}

export async function markAllRead(actor: Actor): Promise<void> {
  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.userId, actor.userId),
        isNull(schema.notifications.readAt),
      ),
    );
}

export async function markRead(actor: Actor, notificationId: string): Promise<void> {
  const rows = await db
    .select({ id: schema.notifications.id })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.userId, actor.userId),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new DogfoodError("NOT_FOUND", "Notification not found");

  await db
    .update(schema.notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.userId, actor.userId),
        isNull(schema.notifications.readAt),
      ),
    );
}
