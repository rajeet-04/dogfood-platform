"use client";

import { useActionState } from "react";

import type { FormState } from "../lib/form-state";

type ActionFormProps = {
  action: (
    prev: FormState | undefined,
    formData: FormData,
  ) => Promise<FormState | undefined>;
  submitLabel: string;
  pendingLabel?: string;
  submitDisabled?: boolean;
  children?: React.ReactNode;
  className?: string;
};

export function ActionForm({
  action,
  submitLabel,
  pendingLabel = "Working…",
  submitDisabled = false,
  children,
  className,
}: ActionFormProps) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error ? (
        <p
          data-testid="form-error"
          className="mt-2 text-sm text-red-600"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <p data-testid="form-success" className="mt-2 text-sm text-emerald-600">
          {state.success}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending || submitDisabled}
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-slate-900"
      >
        {pending ? (
          <>
            <span
              aria-hidden="true"
              className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"
            />
            {pendingLabel}
          </>
        ) : (
          submitLabel
        )}
      </button>
    </form>
  );
}