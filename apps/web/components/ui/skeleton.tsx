import { cn } from "../../lib/cn";

/**
 * Loading placeholders mirror the shape of the content they replace, so the
 * layout does not jump when data lands. A shimmer runs across each block.
 */
function Base({
  className,
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}) {
  const radius = {
    sm: "rounded-xs",
    md: "rounded-md",
    lg: "rounded-lg",
    full: "rounded-full",
  }[rounded];
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-shimmer bg-surface-active",
        radius,
        className,
      )}
    />
  );
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Base
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonStatGrid({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 lg:grid-cols-4",
        className,
      )}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-line bg-surface p-4 shadow-xs"
        >
          <Base className="h-2.5 w-16" />
          <Base className="mt-3 h-7 w-12" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("divide-y divide-line-subtle", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-5 py-4">
          <Base rounded="full" className="size-8" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <Base className="h-3.5 w-1/3" />
            <Base className="h-3 w-1/2" />
          </div>
          <Base className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} role="status" aria-label="Loading">
      <div className="flex gap-4 border-b border-line px-5 py-3">
        {Array.from({ length: columns }, (_, index) => (
          <Base key={index} className="h-2.5 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-line-subtle px-5 py-3.5 last:border-0">
          {Array.from({ length: columns }, (_, index) => (
            <Base key={index} className={cn("h-3.5 flex-1", index === 0 && "max-w-[30%]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonPageHeader() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading">
      <Base className="h-2.5 w-32" />
      <Base className="h-7 w-64" />
      <Base className="h-3.5 w-96 max-w-full" />
    </div>
  );
}

export { Base as Skeleton };
