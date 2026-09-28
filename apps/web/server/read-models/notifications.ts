import { getInbox, type NotificationInbox } from "@dogfood/notifications";

import { getActor } from "../session";

export type { NotificationInbox };

export async function getNotificationInbox(): Promise<NotificationInbox> {
  const actor = await getActor();
  if (!actor) return { items: [], unreadCount: 0 };
  return getInbox(actor);
}
