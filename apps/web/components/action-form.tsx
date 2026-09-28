"use client";

import { useActionState } from "react";

import type { FormState } from "../lib/form-state";
import { SubmitButton, type ButtonSize } from "./ui/button";
import { cn } from "../lib/cn";

type ActionFormProps = {
  action: (
    prev: FormState | undefined,
    formData: FormData,
  ) => Promise<FormState | undefined>;
  submitLabel: string;
  pendingLabel?: string;
  submitDisabled?: boolean;
  submitVariant?: "primary" | "secondary" | "outline" | "destructive";
  submitSize?: ButtonSize;
  /**
   * `stacked` (default) puts the submit row below the fields. `inline` keeps it
   * on the same line as the last field, for rows inside tables and lists.
   */
  layout?: "stacked" | "inline";
  children?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
};

/**
 * Every mutation in the product goes through here, so pending states, inline
 * errors and success messages behave identically across all workspaces.
 */
export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Working…",
  submitDisabled = false,
  submitVariant = "primary",
  submitSize = "md",
  layout = "stacked",
  children,
  className,
  footer,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error ? (
        <p
          data-testid="form-error"
          role="alert"
          className="mt-2.5 rounded-md border border-danger-border bg-danger-soft px-3 py-2 text-small text-danger-fg"
        >
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p
          data-testid="form-success"
          role="status"
          className="mt-2.5 rounded-md border border-success-border bg-success-soft px-3 py-2 text-small text-success-fg"
        >
          {state.success}
        </p>
      ) : null}
      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          layout === "stacked" ? "mt-4" : "mt-0",
        )}
      >
        <SubmitButton
          loading={pending}
          loadingLabel={pendingLabel}
          disabled={submitDisabled}
          variant={submitVariant}
          size={submitSize}
        >
          {submitLabel}
        </SubmitButton>
        {footer}
      </div>
    </form>
  );
}
