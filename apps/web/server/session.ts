import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSession } from "@dogfood/auth";
import type { Actor } from "@dogfood/shared";

import {
  parseAccounts,
  removeAccount,
  serializeAccounts,
  upsertAccount,
  type SavedAccount,
} from "../lib/accounts";
import {
  ACCOUNTS_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "../lib/session-cookie";

export async function getActor(): Promise<Actor | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return resolveSession(token);
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/login");
  return actor;
}

export async function setSessionCookie(rawToken: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function getSavedAccounts(): Promise<SavedAccount[]> {
  return parseAccounts((await cookies()).get(ACCOUNTS_COOKIE)?.value);
}

export async function getCurrentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

async function writeAccounts(accounts: SavedAccount[]): Promise<void> {
  const store = await cookies();
  if (accounts.length === 0) {
    store.delete(ACCOUNTS_COOKIE);
    return;
  }
  store.set(ACCOUNTS_COOKIE, serializeAccounts(accounts), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function rememberAccount(
  account: Omit<SavedAccount, "token"> & { token: string },
): Promise<void> {
  const current = await getSavedAccounts();
  await writeAccounts(upsertAccount(current, account));
}

export async function forgetAccount(token: string): Promise<void> {
  const current = await getSavedAccounts();
  await writeAccounts(removeAccount(current, token));
}