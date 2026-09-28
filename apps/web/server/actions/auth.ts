"use server";

import { redirect } from "next/navigation";
import { z } from "@dogfood/validation";
import {
  authenticateCredentials,
  createSession,
  registerUser,
} from "@dogfood/auth";

import type { FormState } from "../../lib/form-state";
import { clearSessionCookie, setSessionCookie } from "../session";
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
  } catch (err) {
    return { error: describeError(err) };
  }
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/");
}