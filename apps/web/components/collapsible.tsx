import type { ReactNode } from "react";

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
  className = "",
  bodyClassName = "",
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
      className={`group ${plain ? "" : "rounded-2xl border border-slate-200 bg-white"} ${className}`}
    >
      <summary
        className={`flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-4 gap-y-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 [&::-webkit-details-marker]:hidden ${
          plain
            ? "rounded-lg py-2 hover:bg-slate-50"
            : "rounded-2xl px-6 py-4 hover:bg-slate-50/70"
        }`}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <ChevronIcon />
          <span className="text-lg font-semibold text-slate-900">{title}</span>
        </span>
        {meta ? (
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-2 text-xs text-slate-500">
            {meta}
          </span>
        ) : null}
      </summary>
      <div
        className={`${
          plain
            ? "px-2 pb-2 pt-1"
            : "border-t border-slate-100 px-6 py-5"
        } ${bodyClassName}`}
      >
        {children}
      </div>
    </details>
  );
}

function ChevronIcon() {
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition-transform duration-150 group-open:rotate-90 group-open:bg-indigo-100 group-open:text-indigo-600"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}
