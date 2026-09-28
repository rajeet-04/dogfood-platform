import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Data tables.
 *
 * Density is deliberate: 44px rows, hairline dividers, no zebra striping and a
 * hover wash. Below `sm` the table switches to a stacked card layout driven by
 * each cell's `label` prop, so a wide table never causes horizontal scrolling
 * on a phone.
 */
export function TableWrap({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("w-full overflow-x-auto", className)}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <table
      className={cn("w-full border-collapse text-small", className)}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"thead">) {
  return (
    <thead
      className={cn("border-b border-line bg-surface-sunken/60", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-y divide-line-subtle", className)} {...props} />;
}

export function TableRow({
  className,
  interactive = false,
  ...props
}: ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cn(
        "transition-colors duration-100",
        interactive && "hover:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}

export function TableHeader({
  className,
  align = "left",
  ...props
}: ComponentProps<"th"> & { align?: "left" | "right" | "center" }) {
  return (
    <th
      scope="col"
      className={cn(
        "px-4 py-2.5 text-micro font-semibold tracking-[0.06em] text-fg-subtle whitespace-nowrap uppercase",
        align === "right" && "text-right",
        align === "center" && "text-center",
        "hidden sm:table-cell",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  align = "left",
  label,
  primary = false,
  ...props
}: ComponentProps<"td"> & {
  align?: "left" | "right" | "center";
  /** Shown above the value once the table stacks on small screens. */
  label?: string;
  primary?: boolean;
}) {
  return (
    <td
      data-label={label}
      className={cn(
        "px-4 py-3 align-middle",
        "sm:table-cell",
        // Stacked layout: label above value, both full width.
        "flex items-center justify-between gap-4",
        align === "right" && "sm:text-right",
        align === "center" && "sm:text-center",
        primary && "font-medium text-fg",
        className,
      )}
      {...props}
    >
      {label ? (
        <span className="shrink-0 text-caption font-medium text-fg-subtle sm:hidden">
          {label}
        </span>
      ) : null}
      <span className="min-w-0 sm:contents">{props.children}</span>
    </td>
  );
}

/** Header cell that stays visible when the table stacks. */
export function TableStandaloneHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:hidden",
        className,
      )}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Definition list used instead of a two-column table for key/value metadata.
 * Stacks gracefully and keeps the label visually subordinate.
 */
export function DescriptionList({
  className,
  columns = 2,
  children,
}: {
  className?: string;
  columns?: 1 | 2 | 3 | 4;
  children: ReactNode;
}) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-4",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </dl>
  );
}
