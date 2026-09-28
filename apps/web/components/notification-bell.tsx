"use client";

import Link from "next/link";
import { useActionState } from "react";

import type { NotificationListItem } from "@dogfood/notifications";
import { markNotificationsReadAction } from "../server/actions/notifications";
import type { FormState } from "../lib/form-state";

function MarkAllReadButton() {
  const [_state, form, pending] = useActionState<
    FormState | undefined,
    FormData
  >(markNotificationsReadAction, undefined);
  return (
    <form action={form}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-blue-600 hover:underline disabled:opacity-60"
      >
        Mark all read
      </button>
    </form>
  );
}

function formatWhen(value: Date): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

function NotificationRow({ item }: { item: NotificationListItem }) {
  const body = (
    <>
      <p
        className={`text-sm ${item.readAt ? "text-slate-600" : "font-medium text-slate-900"}`}
      >
        {item.title}
      </p>
      {item.body ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.body}</p>
      ) : null}
      <p className="mt-1 text-xs text-slate-400">{formatWhen(item.createdAt)}</p>
    </>
  );

  return (
    <li className="border-b border-slate-100 last:border-0">
      {item.href ? (
        <Link href={item.href} className="block px-3 py-2 hover:bg-slate-50">
          {body}
        </Link>
      ) : (
        <div className="px-3 py-2">{body}</div>
      )}
    </li>
  );
}

export function NotificationBell({
  items,
  unreadCount,
}: {
  items: NotificationListItem[];
  unreadCount: number;
}) {
  return (
    <details className="relative" data-testid="notification-bell">
      <summary
        className="flex cursor-pointer list-none items-center gap-1 text-slate-600 hover:text-slate-900"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <span aria-hidden="true">🔔</span>
        <span className="sr-only">Notifications</span>
        {unreadCount > 0 ? (
          <span
            data-testid="notification-unread-count"
            className="rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-medium text-white"
          >
            {unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-80 rounded-md border border-slate-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          {unreadCount > 0 ? <MarkAllReadButton /> : null}
        </div>
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500" data-testid="notification-empty">
            You are all caught up.
          </p>
        ) : (
          <ul data-testid="notification-list" className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
