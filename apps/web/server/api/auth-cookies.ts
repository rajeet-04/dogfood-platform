import {
  ACCOUNTS_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
} from "../../lib/session-cookie";
import {
  parseAccounts,
  removeAccount,
  serializeAccounts,
  upsertAccount,
  type SavedAccount,
} from "../../lib/accounts";
import { api } from "./http";

function requestCookie(request: Request, name: string): string | undefined {
  for (const part of request.headers.get("cookie")?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function cookie(name: string, value: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function authJson(
  data: unknown,
  setCookies: string[] = [],
  status = 200,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  for (const value of setCookies) headers.append("Set-Cookie", value);
  return new Response(JSON.stringify(data), { status, headers });
}

export async function authApi(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const response = await api(request, handler);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function sessionCookies(token: string): string[] {
  return [cookie(SESSION_COOKIE, token, SESSION_MAX_AGE)];
}

export function rememberAccountCookie(
  request: Request,
  account: SavedAccount,
): string {
  const saved = parseAccounts(requestCookie(request, ACCOUNTS_COOKIE));
  return cookie(
    ACCOUNTS_COOKIE,
    encodeURIComponent(serializeAccounts(upsertAccount(saved, account))),
    SESSION_MAX_AGE,
  );
}

export function savedAccountTokens(request: Request): Set<string> {
  return new Set(
    parseAccounts(requestCookie(request, ACCOUNTS_COOKIE)).map((item) => item.token),
  );
}

export function currentSessionToken(request: Request): string | undefined {
  return requestCookie(request, SESSION_COOKIE) || undefined;
}

export function forgetAccountsCookie(request: Request, tokens: Set<string>): string {
  let saved = parseAccounts(requestCookie(request, ACCOUNTS_COOKIE));
  for (const token of tokens) saved = removeAccount(saved, token);
  return cookie(
    ACCOUNTS_COOKIE,
    encodeURIComponent(serializeAccounts(saved)),
    SESSION_MAX_AGE,
  );
}

export function clearedSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
