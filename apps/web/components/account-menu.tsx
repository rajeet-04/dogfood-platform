"use client";

import { useActionState } from "react";
import { ChevronDown, LogOut, Users } from "lucide-react";

import {
  signOutAccountAction,
  signOutAllAction,
  switchAccountAction,
} from "../server/actions/auth";
import { cn } from "../lib/cn";
import { Dropdown } from "./ui/dropdown";
import { SubmitButton } from "./ui/button";

export type AccountSummary = {
  token: string;
  email: string;
  displayName: string;
  isCurrent: boolean;
};

export function AccountRow({ account }: { account: AccountSummary }) {
  // Server actions are module references, so they are imported and bound here in
  // the client component. A closure created in a server component could not be
  // serialised across the boundary.
  const [switchState, switchForm, switchPending] = useActionState(
    switchAccountAction.bind(null, account.token),
    undefined,
  );
  const [signOutState, signOutForm, signOutPending] = useActionState(
    signOutAccountAction.bind(null, account.token),
    undefined,
  );

  return (
    <li
      data-testid="account-row"
      className="rounded-lg border border-line-subtle bg-surface px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-small font-medium text-fg">
            {account.displayName}
          </p>
          <p className="truncate text-caption text-fg-subtle">{account.email}</p>
        </div>
        {account.isCurrent ? (
          <span className="mt-0.5 shrink-0 rounded-full bg-success-soft px-2 py-0.5 text-micro font-semibold text-success-fg">
            Current
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        {account.isCurrent ? null : (
          <form action={switchForm}>
            <SubmitButton
              size="sm"
              variant="secondary"
              loading={switchPending}
              loadingLabel="Switching…"
            >
              Switch to
            </SubmitButton>
          </form>
        )}
        <form action={signOutForm}>
          <SubmitButton
            size="sm"
            variant="ghost"
            loading={signOutPending}
            loadingLabel="Signing out…"
            className="text-danger-fg hover:bg-danger-soft"
          >
            Sign out
          </SubmitButton>
        </form>
      </div>
      {switchState?.error ? (
        <p className="mt-1.5 text-caption text-danger-fg" role="alert">
          {switchState.error}
        </p>
      ) : null}
      {signOutState?.success ? (
        <p className="mt-1.5 text-caption text-success-fg">{signOutState.success}</p>
      ) : null}
    </li>
  );
}

export function SignOutAllButton() {
  const [state, form, pending] = useActionState(signOutAllAction, undefined);
  return (
    <form action={form} className="border-t border-line-subtle pt-2.5">
      <SubmitButton
        size="sm"
        variant="ghost"
        loading={pending}
        loadingLabel="Signing out…"
        className="w-full justify-start text-danger-fg hover:bg-danger-soft"
      >
        <LogOut aria-hidden="true" className="size-3.5" />
        Sign out of all accounts
      </SubmitButton>
      {state?.success ? (
        <p className="mt-1.5 text-caption text-success-fg">{state.success}</p>
      ) : null}
    </form>
  );
}

/**
 * Multi-account switcher. The panel holds real forms, so it is a dialog rather
 * than a menu - a `menu` may only contain menu items.
 */
export function AccountSwitcher({ accounts }: { accounts: AccountSummary[] }) {
  return (
    <Dropdown
      as="dialog"
      panelClassName="w-80 p-2"
      trigger={({ open, toggle, id, ...aria }) => (
        <button
          {...aria}
          id={id}
          type="button"
          onClick={toggle}
          aria-label={`Accounts (${accounts.length})`}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-small font-medium",
            "text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--df-ring)]",
          )}
        >
          <Users aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Accounts ({accounts.length})</span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 text-fg-faint transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
      )}
    >
      {() => (
        <div>
          <p className="px-1 pt-1 pb-2 text-micro font-semibold tracking-[0.06em] text-fg-faint uppercase">
            Signed-in accounts
          </p>
          <ul className="flex flex-col gap-1.5">
            {accounts.map((account) => (
              <AccountRow key={account.token} account={account} />
            ))}
          </ul>
          <div className="mt-2">
            <SignOutAllButton />
          </div>
        </div>
      )}
    </Dropdown>
  );
}
