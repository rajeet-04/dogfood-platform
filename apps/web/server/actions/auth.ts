"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "@dogfood/validation";
import {
  authenticateCredentials,
  createSession,
  registerUser,
  resolveSessionAccount,
  revokeSessionByToken,
} from "@dogfood/auth";

import type { FormState } from "../../lib/form-state";
import {
  clearSessionCookie,
  forgetAccount,
  getCurrentSessionToken,
  getSavedAccounts,
  rememberAccount,
  setSessionCookie,
} from "../session";
import { describeError } from "./common";

const registerSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  displayName: z.string().min(1, "Display name is required."),
});

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

function safeNext(raw: FormDataEntryValue | null): string {
  if (typeof raw !== "string" || raw.length === 0) return "/events";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/events";
  return raw;
}

export async function registerAction(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const next = safeNext(formData.get("next"));
  try {
    const user = await registerUser(parsed.data);
    const { rawToken } = await createSession(user.id);
    await setSessionCookie(rawToken);
    await rememberAccount({
      token: rawToken,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (err) {
    return { error: describeError(err) };
  }
  redirect(next);
}

export async function loginAction(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const next = safeNext(formData.get("next"));
  try {
    const user = await authenticateCredentials(parsed.data);
    const { rawToken } = await createSession(user.id);
    await setSessionCookie(rawToken);
    await rememberAccount({
      token: rawToken,
      email: user.email,
      displayName: user.displayName,
    });
  } catch (err) {
    return { error: describeError(err) };
  }
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}

export async function switchAccountAction(
  token: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const account = await resolveSessionAccount(token);
  if (!account) {
    await forgetAccount(token);
    return { error: "That account session has expired. Log in again." };
  }
  await setSessionCookie(account.token);
  revalidatePath("/", "layout");
  redirect("/events");
}

export async function signOutAccountAction(
  token: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const currentToken = (await getCurrentSessionToken()) ?? "";
  await revokeSessionByToken(token);
  await forgetAccount(token);
  if (token === currentToken) {
    const remaining = (await getSavedAccounts())[0];
    const fallback = remaining
      ? await resolveSessionAccount(remaining.token)
      : null;
    if (fallback) {
      await setSessionCookie(fallback.token);
    } else {
      await clearSessionCookie();
    }
  }
  revalidatePath("/", "layout");
  return { success: "Signed out." };
}

export async function signOutAllAction(
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const accounts = await getSavedAccounts();
  for (const account of accounts) {
    await revokeSessionByToken(account.token);
  }
  await clearSessionCookie();
  revalidatePath("/", "layout");
  return { success: "Signed out of all accounts." };
}