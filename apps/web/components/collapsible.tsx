import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { cn } from "../lib/cn";

/**
 * Progressive-disclosure block built on the native `<details>` element: the
 * summary always shows the key points (title plus a `meta` line of counts,
 * badges or dates) and the body only becomes visible once the summary is
 * clicked. Native markup keeps it keyboard accessible and free of client state.
 *
 * `variant="plain"` drops the card chrome so the block can be nested inside
 * another card without a border inside a border.
 */
export function Collapsible({
  title,
  meta,
  defaultOpen = false,
  variant = "card",
  className,
  bodyClassName,
  testId,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  variant?: "card" | "plain";
  className?: string;
  bodyClassName?: string;
  testId?: string;
  children: ReactNode;
}) {
  const plain = variant === "plain";
  return (
    <details
      open={defaultOpen}
      data-testid={testId}
      className={cn(
        "group",
        !plain && "rounded-xl border border-line bg-surface",
        className,
      )}
    >
      <summary
        className={cn(
          "flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-surface-hover [&::-webkit-details-marker]:hidden",
          plain && "rounded-md px-2 py-2",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ChevronRight
            aria-hidden="true"
            className="size-4 shrink-0 text-fg-faint transition-transform duration-150 group-open:rotate-90"
          />
          <span className="text-subheading font-semibold text-fg">{title}</span>
        </span>
        {meta ? (
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-caption text-fg-subtle">
            {meta}
          </span>
        ) : null}
      </summary>
      <div
        className={cn(
          plain
            ? "px-2 pt-1 pb-2"
            : "border-t border-line-subtle px-5 py-4",
          bodyClassName,
        )}
      >
        {children}
      </div>
    </details>
  );
}
