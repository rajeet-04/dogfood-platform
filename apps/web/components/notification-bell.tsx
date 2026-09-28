"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Bell } from "lucide-react";

import type { NotificationListItem } from "@dogfood/notifications";
import { markNotificationsReadAction } from "../server/actions/notifications";
import type { FormState } from "../lib/form-state";
import { cn } from "../lib/cn";
import { SubmitButton } from "./ui/button";

function MarkAllReadButton() {
  const [_state, form, pending] = useActionState<
    FormState | undefined,
    FormData
  >(markNotificationsReadAction, undefined);
  return (
    <form action={form}>
      <SubmitButton
        size="sm"
        variant="ghost"
        loading={pending}
        loadingLabel="Marking…"
        className="-mr-1.5"
      >
        Mark all read
      </SubmitButton>
    </form>
  );
}

function formatWhen(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  return `${part("month")} ${part("day")}, ${part("hour")}:${part("minute")} ${part("dayPeriod")} UTC`;
}

function NotificationRow({ item }: { item: NotificationListItem }) {
  const body = (
    <>
      <p
        className={cn(
          "text-small",
          item.readAt ? "text-fg-muted" : "font-medium text-fg",
        )}
      >
        {item.title}
        {item.readAt ? null : (
          <span
            aria-hidden="true"
            className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle"
          />
        )}
        <span className="sr-only">
          {item.readAt ? "" : ", unread"}
        </span>
      </p>
      {item.body ? (
        <p className="mt-0.5 line-clamp-2 text-caption text-fg-subtle">{item.body}</p>
      ) : null}
      <p className="mt-1 text-caption text-fg-faint">{formatWhen(item.createdAt)}</p>
    </>
  );

  return (
    <li className="border-b border-line-subtle last:border-0">
      {item.href ? (
        <Link href={item.href} className="block px-3.5 py-2.5 transition-colors hover:bg-surface-hover">
          {body}
        </Link>
      ) : (
        <div className="px-3.5 py-2.5">{body}</div>
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
    <details className="disclosure relative" data-testid="notification-bell">
      <summary
        className="relative flex size-9 cursor-pointer list-none items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <Bell aria-hidden="true" className="size-4" />
        <span className="sr-only">Notifications</span>
        {unreadCount > 0 ? (
          <span
            data-testid="notification-unread-count"
            className="absolute top-1 right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-danger-solid px-1 text-micro font-semibold text-white tabular"
          >
            {unreadCount}
          </span>
        ) : null}
      </summary>
      <div className="animate-pop absolute right-0 z-40 mt-1.5 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle bg-surface-sunken/60 px-3.5 py-2.5">
          <p className="text-subheading font-semibold text-fg">Notifications</p>
          {unreadCount > 0 ? <MarkAllReadButton /> : null}
        </div>
        {items.length === 0 ? (
          <p
            className="px-3.5 py-6 text-center text-small text-fg-subtle"
            data-testid="notification-empty"
          >
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
