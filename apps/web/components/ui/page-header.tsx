import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "../../lib/cn";

export type Crumb = {
  label: string;
  href?: string;
};

/** `Events / Hack Season / Organizer` - the last crumb is the current page. */
export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-caption">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  aria-hidden="true"
                  className="size-3 shrink-0 text-fg-faint"
                />
              ) : null}
              {item.href && !last ? (
                <Link
                  href={item.href}
                  className="truncate rounded-xs py-1.5 font-medium text-fg-subtle transition-colors hover:text-fg"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={cn(
                    "truncate py-1.5",
                    last ? "font-medium text-fg" : "text-fg-subtle",
                  )}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * The standard page introduction: breadcrumb, title, supporting line and the
 * page's primary actions. Every route uses this so the top of a screen always
 * answers "where am I" and "what can I do here".
 */
export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  meta,
  className,
  children,
}: {
  breadcrumbs?: Crumb[];
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  // A page's introduction is not a banner landmark - the app shell owns the
  // only <header> on screen.
  return (
    <div className={cn("space-y-4", className)}>
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-title font-semibold text-fg">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-small text-fg-subtle">{description}</p>
          ) : null}
          {meta ? <div className="flex flex-wrap items-center gap-2">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/** Standard page gutter and max width so every route lines up. */
export function Page({
  className,
  width = "default",
  ...props
}: React.ComponentProps<"main"> & { width?: "narrow" | "default" | "wide" }) {
  return (
    <main
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8",
        width === "narrow" && "max-w-3xl",
        width === "default" && "max-w-6xl",
        width === "wide" && "max-w-7xl",
        className,
      )}
      {...props}
    />
  );
}
