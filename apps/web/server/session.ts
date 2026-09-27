import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { resolveSession } from "@dogfood/auth";
import type { Actor } from "@dogfood/shared";

export const SESSION_COOKIE = "dogfood_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

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