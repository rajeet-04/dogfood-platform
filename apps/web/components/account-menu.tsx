"use client";

import { useActionState } from "react";

import type { FormState } from "../lib/form-state";

export type AccountSummary = {
  token: string;
  email: string;
  displayName: string;
  isCurrent: boolean;
};

type BoundAction = (
  prev: FormState | undefined,
  formData: FormData,
) => Promise<FormState | undefined>;

export function AccountRow({
  account,
  switchAction,
  signOutAction,
}: {
  account: AccountSummary;
  switchAction: BoundAction;
  signOutAction: BoundAction;
}) {
  const [switchState, switchForm, switchPending] = useActionState(
    switchAction,
    undefined,
  );
  const [signOutState, signOutForm, signOutPending] = useActionState(
    signOutAction,
    undefined,
  );

  return (
    <li
      data-testid="account-row"
      className="border-b border-slate-100 pb-2 last:border-0 last:pb-0"
    >
      <p className="text-sm font-medium text-slate-900">
        {account.displayName}
        {account.isCurrent ? (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            Current
          </span>
        ) : null}
      </p>
      <p className="text-xs text-slate-500">{account.email}</p>
      <div className="mt-1 flex gap-3">
        {account.isCurrent ? null : (
          <form action={switchForm}>
            <button
              type="submit"
              disabled={switchPending}
              className="text-xs text-blue-600 hover:underline disabled:opacity-60"
            >
              Switch to
            </button>
          </form>
        )}
        <form action={signOutForm}>
          <button
            type="submit"
            disabled={signOutPending}
            className="text-xs text-red-600 hover:underline disabled:opacity-60"
          >
            Sign out
          </button>
        </form>
      </div>
      {switchState?.error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {switchState.error}
        </p>
      ) : null}
      {signOutState?.success ? (
        <p className="mt-1 text-xs text-emerald-600">{signOutState.success}</p>
      ) : null}
    </li>
  );
}

export function SignOutAllButton({
  action,
}: {
  action: (
    prev: FormState | undefined,
    formData: FormData,
  ) => Promise<FormState | undefined>;
}) {
  const [state, form, pending] = useActionState(action, undefined);
  return (
    <form action={form} className="mt-3">
      <button
        type="submit"
        disabled={pending}
        className="text-xs font-medium text-red-700 hover:underline disabled:opacity-60"
      >
        Sign out of all accounts
      </button>
      {state?.success ? (
        <p className="mt-1 text-xs text-emerald-600">{state.success}</p>
      ) : null}
    </form>
  );
}
