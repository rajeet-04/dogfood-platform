import Link from "next/link";
import { cookies } from "next/headers";

import { resolveSessionAccount } from "@dogfood/auth";

import { getActor, getSavedAccounts } from "../server/session";
import { getNotificationInbox } from "../server/read-models/notifications";
import {
  logoutAction,
  signOutAccountAction,
  signOutAllAction,
  switchAccountAction,
} from "../server/actions/auth";
import { AccountRow, SignOutAllButton } from "./account-menu";
import { NotificationBell } from "./notification-bell";
import { SESSION_COOKIE } from "../lib/session-cookie";

export async function Header() {
  const actor = await getActor();
  const accounts = await getSavedAccounts();
  const inbox = await getNotificationInbox();
  const currentToken = (await cookies()).get(SESSION_COOKIE)?.value;
  const switchable = [];
  for (const account of accounts) {
    const resolved = await resolveSessionAccount(account.token);
    if (resolved) {
      switchable.push({
        token: resolved.token,
        email: resolved.email,
        displayName: resolved.displayName,
        isCurrent: resolved.token === currentToken,
      });
    }
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          DOGFOOD
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/events" className="text-slate-600 hover:text-slate-900">
            Events
          </Link>
          {actor ? (
            <>
              <NotificationBell
                items={inbox.items}
                unreadCount={inbox.unreadCount}
              />
              {switchable.length > 1 ? (
                <details className="relative">
                  <summary className="cursor-pointer list-none text-slate-600 hover:text-slate-900">
                    Accounts ({switchable.length})
                  </summary>
                  <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border border-slate-200 bg-white p-3 shadow-lg">
                    <ul className="space-y-3">
                      {switchable.map((account) => (
                        <AccountRow
                          key={account.token}
                          account={account}
                          switchAction={switchAccountAction.bind(
                            null,
                            account.token,
                          )}
                          signOutAction={signOutAccountAction.bind(
                            null,
                            account.token,
                          )}
                        />
                      ))}
                    </ul>
                    <SignOutAllButton action={signOutAllAction} />
                  </div>
                </details>
              ) : null}
              <Link href="/profile" className="text-slate-600 hover:text-slate-900">
                Profile
              </Link>
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="text-slate-600 hover:text-slate-900"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-slate-600 hover:text-slate-900">
                Log in
              </Link>
              <Link
                href="/register"
                className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white"
              >
                Register
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
