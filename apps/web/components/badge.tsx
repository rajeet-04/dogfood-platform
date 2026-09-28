import type { ReactNode } from "react";

import { cn } from "../lib/cn";

/**
 * Semantic status vocabulary.
 *
 * `neutral` / `info` / `success` / `warning` / `danger` / `accent` / `violet`
 * are the canonical tones. The remaining names are legacy aliases kept because
 * event, judging and domain code already maps states onto them.
 */
const TONE_CLASS = {
  neutral: "bg-neutral-soft text-neutral-fg border-neutral-border",
  slate: "bg-neutral-soft text-neutral-fg border-neutral-border",
  info: "bg-info-soft text-info-fg border-info-border",
  sky: "bg-info-soft text-info-fg border-info-border",
  blue: "bg-info-soft text-info-fg border-info-border",
  accent: "bg-accent-soft text-accent-soft-fg border-accent-border",
  indigo: "bg-accent-soft text-accent-soft-fg border-accent-border",
  violet: "bg-accent-2-soft text-accent-2-fg border-accent-2-border",
  success: "bg-success-soft text-success-fg border-success-border",
  emerald: "bg-success-soft text-success-fg border-success-border",
  warning: "bg-warning-soft text-warning-fg border-warning-border",
  amber: "bg-warning-soft text-warning-fg border-warning-border",
  danger: "bg-danger-soft text-danger-fg border-danger-border",
  rose: "bg-danger-soft text-danger-fg border-danger-border",
} as const;

export type BadgeTone = keyof typeof TONE_CLASS;

/**
 * Status pill. Always carries a text label so meaning never depends on colour
 * alone, and uses a soft tinted background rather than a saturated fill.
 */
export function Badge({
  tone = "neutral",
  className = "",
  testId,
  children,
  icon,
}: {
  tone?: BadgeTone;
  className?: string;
  testId?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5",
        "text-micro font-semibold whitespace-nowrap",
        TONE_CLASS[tone] ?? TONE_CLASS.neutral,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** A status dot for dense rows where a full pill is too heavy. */
export function StatusDot({
  tone = "neutral",
  className,
  label,
}: {
  tone?: BadgeTone;
  className?: string;
  label?: string;
}) {
  const dot: Record<BadgeTone, string> = {
    neutral: "bg-fg-faint",
    slate: "bg-fg-faint",
    info: "bg-info-solid",
    sky: "bg-info-solid",
    blue: "bg-info-solid",
    accent: "bg-accent",
    indigo: "bg-accent",
    violet: "bg-accent-2-fg",
    success: "bg-success-solid",
    emerald: "bg-success-solid",
    warning: "bg-warning-solid",
    amber: "bg-warning-solid",
    danger: "bg-danger-solid",
    rose: "bg-danger-solid",
  };
  return (
    <span
      className={cn("size-1.5 shrink-0 rounded-full", dot[tone], className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/** Label/value pair for a `<dl>` grid: the label recedes, the value leads. */
export function Stat({
  label,
  value,
  testId,
  className,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-micro font-semibold tracking-[0.06em] text-fg-faint uppercase">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-1 text-small font-medium break-words text-fg"
      >
        {value}
      </dd>
    </div>
  );
}

/** Compact headline number used above collapsible detail blocks. */
export function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-line-subtle bg-surface-sunken px-3.5 py-3">
      <p className="text-micro font-semibold tracking-[0.06em] text-fg-faint uppercase">
        {label}
      </p>
      <p className="tabular mt-1 text-heading font-semibold text-fg">{value}</p>
      {hint ? <p className="mt-0.5 text-caption text-fg-subtle">{hint}</p> : null}
    </div>
  );
}

/** Thin determinate bar used for judging coverage and similar ratios. */
export function Progress({
  value,
  max,
  label,
  tone = "accent",
  size = "md",
  className,
}: {
  value: number;
  max: number;
  label: string;
  tone?: "accent" | "success" | "warning";
  size?: "sm" | "md";
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = {
    accent: "bg-accent",
    success: "bg-success-solid",
    warning: "bg-warning-solid",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={`${value} of ${max}`}
      aria-label={label}
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-active",
        size === "sm" ? "h-1" : "h-1.5",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-[var(--ease-out-soft)]",
          fill,
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Consistent empty state so every list reads the same when it has no rows. */
export function EmptyState({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "px-6 py-10 text-center text-small text-fg-subtle",
        className,
      )}
    >
      {children}
    </p>
  );
}
