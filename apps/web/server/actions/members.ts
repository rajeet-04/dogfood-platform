"use server";

import { revalidatePath } from "next/cache";
import { db, eq, schema } from "@dogfood/db";
import {
  grantEventMembership,
  joinEvent,
  removeEventMembership,
} from "@dogfood/events";
import { z } from "@dogfood/validation";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { describeError, runAction } from "./common";

const EMAIL = z.string().email("A valid email is required.");
const ROLE = z.enum(["PARTICIPANT", "JUDGE", "ORGANIZER"]);

export async function joinEventAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await joinEvent(actor, eventId);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

async function userByEmail(email: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1);
  return rows[0];
}

export async function addMemberAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = z
    .object({ email: EMAIL, role: ROLE })
    .safeParse({
      email: formData.get("email"),
      role: formData.get("role"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  if (parsed.data.role === "PARTICIPANT") {
    return {
      error: "Participants join from the event page, not through this form.",
    };
  }
  try {
    const user = await userByEmail(parsed.data.email);
    if (!user) {
      return { error: "No account found with that email." };
    }
    await grantEventMembership(actor, eventId, user.id, parsed.data.role);
    revalidatePath(`/events/${eventId}/organizer`);
    return { success: "Member added." };
  } catch (err) {
    return { error: describeError(err) };
  }
}

export async function changeMemberRoleAction(
  eventId: string,
  userId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = ROLE.safeParse(formData.get("role"));
  if (!parsed.success) {
    return { error: "Role must be PARTICIPANT, JUDGE, or ORGANIZER." };
  }
  return runAction(async () => {
    await grantEventMembership(actor, eventId, userId, parsed.data);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function removeMemberAction(
  eventId: string,
  userId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await removeEventMembership(actor, eventId, userId);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}