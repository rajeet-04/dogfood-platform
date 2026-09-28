import Link from "next/link";
import type { ComponentProps } from "react";

import { cn } from "../../lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

const BASE =
  "relative inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap font-medium " +
  "transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-[var(--ease-out-soft)] " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-ring)] " +
  "disabled:pointer-events-none disabled:opacity-55 " +
  "active:translate-y-px";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-xs hover:bg-accent-hover hover:shadow-sm",
  secondary:
    "bg-surface text-fg border border-line shadow-xs hover:bg-surface-hover hover:border-line-strong",
  outline:
    "border border-line-strong bg-transparent text-fg hover:bg-surface-hover",
  ghost: "text-fg-muted hover:bg-surface-hover hover:text-fg",
  destructive:
    "bg-danger-solid text-white shadow-xs hover:bg-danger-700 hover:shadow-sm",
  link: "text-accent underline-offset-4 hover:underline hover:text-accent-hover",
};

const SIZE: Record<ButtonSize, string> = {
  // 32px - dense rows and table actions
  sm: "h-8 rounded-md px-2.5 text-caption",
  // 36px - the default control height across the product
  md: "h-9 rounded-md px-3.5 text-small",
  // 44px - primary calls to action and touch targets
  lg: "h-11 rounded-lg px-5 text-body",
  icon: "h-9 w-9 rounded-md",
};

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}): string {
  return cn(BASE, VARIANT[variant], SIZE[size], className);
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <Link
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}

/** Submit button that swaps in a spinner while a server action is in flight. */
export function SubmitButton({
  variant = "primary",
  size = "md",
  className,
  loading = false,
  loadingLabel,
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonStyles({ variant, size, className })}
      {...props}
    >
      {loading ? (
        <>
          <Spinner className="size-3.5" />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.5"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="2"
      />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
