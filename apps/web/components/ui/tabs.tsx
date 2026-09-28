import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";

export type TabItem = {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Right-aligned count or status, e.g. a badge. */
  trailing?: ReactNode;
  exact?: boolean;
};

/**
 * Route-level tabs. Plain links so they work without JavaScript, prefetch like
 * any other link, and keep the current section obvious via `aria-current`.
 */
export function NavTabs({
  items,
  className,
  label = "Sections",
}: {
  items: TabItem[];
  className?: string;
  label?: string;
}) {
  return (
    <nav aria-label={label} className={cn("min-w-0", className)}>
      <ul
        className={cn(
          "flex gap-1 overflow-x-auto",
          // Hairline separators between tabs, matching enterprise conventions.
          "[&>li]:shrink-0",
        )}
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              scroll={false}
              className={cn(
                "group relative flex items-center gap-2 whitespace-nowrap px-3 py-2.5",
                "text-small font-medium text-fg-subtle transition-colors",
                "hover:text-fg",
                "aria-[current=page]:text-fg",
              )}
            >
              {item.icon}
              {item.label}
              {item.trailing}
              <span
                aria-hidden="true"
                className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-transparent transition-colors group-aria-[current=page]:bg-accent"
              />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Wraps `NavTabs` in a card with a bottom rule, for page-level sub-nav. */
export function TabBar({
  items,
  className,
  actions,
  label,
}: {
  items: TabItem[];
  className?: string;
  actions?: ReactNode;
  label?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-end justify-between gap-4 border-b border-line",
        className,
      )}
    >
      <NavTabs items={items} label={label} className="min-w-0 flex-1" />
      {actions ? (
        <div className="hidden shrink-0 items-center gap-2 pb-1.5 sm:flex">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
