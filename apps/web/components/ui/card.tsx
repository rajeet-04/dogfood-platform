import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/cn";

/**
 * Cards are for grouping information that is only meaningful together. Most of
 * the product deliberately uses plain sections on the canvas instead - a card
 * around everything flattens the hierarchy.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface shadow-xs",
        interactive &&
          "transition-[border-color,box-shadow] duration-150 hover:border-line-strong hover:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  title,
  description,
  action,
  level = 2,
}: {
  className?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  level?: 2 | 3 | 4;
}) {
  const Heading = `h${level}` as "h2" | "h3" | "h4";
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle px-5 py-4",
        className,
      )}
    >
      <div className="min-w-0">
        <Heading className="text-subheading font-semibold text-fg">
          {title}
        </Heading>
        {description ? (
          <p className="mt-0.5 text-caption text-fg-subtle">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-line-subtle bg-surface-sunken/50 px-5 py-3",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A labelled block on the canvas. Used where a full card would be too heavy -
 * the border and background do the grouping without stacking chrome.
 */
export function Panel({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-xl border border-line bg-surface shadow-xs", className)}
      {...props}
    />
  );
}
