import type { ReactNode } from "react";

const TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-100 text-slate-600",
  sky: "bg-sky-50 text-sky-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  violet: "bg-violet-50 text-violet-700",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  rose: "bg-rose-50 text-rose-700",
};

export type BadgeTone = keyof typeof TONE_CLASS;

export function Badge({
  tone = "slate",
  className = "",
  testId,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${TONE_CLASS[tone] ?? TONE_CLASS.slate} ${className}`}
    >
      {children}
    </span>
  );
}

/** Label/value pair for a `<dl>` grid: the label recedes, the value leads. */
export function Stat({
  label,
  value,
  testId,
}: {
  label: string;
  value: ReactNode;
  testId?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium tracking-wide text-slate-400 uppercase">
        {label}
      </dt>
      <dd
        data-testid={testId}
        className="mt-0.5 text-sm font-semibold text-slate-800"
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
    <div className="min-w-0 rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
        {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Thin determinate bar used for judging coverage and similar ratios. */
export function Progress({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div
        className="h-full rounded-full bg-indigo-500 transition-[width] duration-300"
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
      className={`px-6 py-10 text-center text-sm text-slate-500 ${className}`}
    >
      {children}
    </p>
  );
}
