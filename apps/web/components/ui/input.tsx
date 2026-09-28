import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/cn";

const CONTROL_BASE =
  "w-full rounded-md border border-line bg-surface text-fg shadow-xs " +
  "transition-[border-color,box-shadow,background-color] duration-150 " +
  "placeholder:text-fg-faint " +
  "hover:border-line-strong " +
  "focus:border-accent focus:ring-2 focus:ring-[var(--df-accent)]/25 focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-subtle disabled:opacity-100 " +
  "aria-invalid:border-danger-solid aria-invalid:ring-2 aria-invalid:ring-danger-500/20";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(CONTROL_BASE, "h-9 px-3 text-small", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        CONTROL_BASE,
        "min-h-20 resize-y px-3 py-2 text-small leading-6",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        className={cn(
          CONTROL_BASE,
          "h-9 cursor-pointer appearance-none py-0 pr-9 pl-3",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-fg-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m4 6 4 4 4-4" />
      </svg>
    </div>
  );
}

export function Checkbox({
  className,
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 cursor-pointer rounded-xs border border-line-strong bg-surface text-accent",
        "accent-[var(--df-accent)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-ring)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------------- */

export type FieldProps = {
  label: ReactNode;
  /** Explicit description under the control. Keep it to one short sentence. */
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  /** Rendered to the right of the label, e.g. a character counter. */
  aside?: ReactNode;
  children: ReactNode;
};

/**
 * Label + control + description + error, in that order. The label wraps the
 * control so the association survives server rendering without generated ids.
 */
export function Field({
  label,
  description,
  error,
  required = false,
  className,
  aside,
  children,
}: FieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-small font-medium text-fg">
          {label}
          {required ? (
            <span className="ml-0.5 text-danger-solid" aria-hidden="true">
              *
            </span>
          ) : null}
        </span>
        {aside}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {error ? (
        <span
          className="mt-1.5 flex items-start gap-1 text-caption text-danger-fg"
          role="alert"
        >
          {error}
        </span>
      ) : description ? (
        <span className="mt-1.5 block text-caption text-fg-subtle">
          {description}
        </span>
      ) : null}
    </label>
  );
}

export function FieldLabel({
  className,
  required = false,
  children,
}: {
  className?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "block text-small font-medium text-fg",
        className,
      )}
    >
      {children}
      {required ? (
        <span className="ml-0.5 text-danger-solid" aria-hidden="true">
          *
        </span>
      ) : null}
    </span>
  );
}

/** Horizontal rule + heading for grouping long forms into digestible blocks. */
export function FormSection({
  title,
  description,
  action,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-subtle pb-3">
        <div className="min-w-0">
          <h3 className="text-subheading font-semibold text-fg">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-caption text-fg-subtle">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Dashed well used for "add a row" forms so they read as secondary. */
export function AddPanel({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-dashed border-line-strong bg-surface-sunken/60 p-4",
        className,
      )}
    >
      <div className="mb-3">
        <p className="text-small font-semibold text-fg">{title}</p>
        {description ? (
          <p className="mt-0.5 text-caption text-fg-subtle">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
