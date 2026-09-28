import type { ReactNode } from "react";
import Link from "next/link";
import {
  CalendarX2,
  FileQuestion,
  Inbox,
  SearchX,
  ShieldAlert,
} from "lucide-react";

import { cn } from "../../lib/cn";
import { buttonStyles } from "./button";

const ICONS = {
  inbox: Inbox,
  search: SearchX,
  calendar: CalendarX2,
  file: FileQuestion,
  shield: ShieldAlert,
} as const;

export type EmptyStateIcon = keyof typeof ICONS;

/**
 * Every list and panel gets one of these instead of "No data". It says what is
 * missing, why it matters, and gives the single most useful next step.
 */
export function EmptyStatePanel({
  icon = "inbox",
  title,
  description,
  action,
  secondaryAction,
  className,
  compact = false,
  testId,
}: {
  icon?: EmptyStateIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
  compact?: boolean;
  testId?: string;
}) {
  const Icon = ICONS[icon];
  return (
    <div
      data-testid={testId}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong bg-surface-sunken/50 text-center",
        compact ? "gap-2 px-5 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex items-center justify-center rounded-full bg-surface text-fg-faint ring-1 ring-line",
          compact ? "size-9" : "size-11",
        )}
      >
        <Icon className={compact ? "size-4" : "size-5"} />
      </span>
      <div className="max-w-sm space-y-1">
        <p
          className={cn(
            "font-semibold text-fg",
            compact ? "text-small" : "text-subheading",
          )}
        >
          {title}
        </p>
        {description ? (
          <p className="text-caption leading-5 text-fg-subtle">{description}</p>
        ) : null}
      </div>
      {action || secondaryAction ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}

/** Convenience wrapper for the most common case: a link styled as a button. */
export function EmptyStateLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline";
}) {
  return (
    <Link href={href} className={buttonStyles({ variant, size: "sm" })}>
      {children}
    </Link>
  );
}
