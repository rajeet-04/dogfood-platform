"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "@dogfood/validation";
import { createEvent, transitionEvent } from "@dogfood/events";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { describeError, runAction } from "./common";

const createEventSchema = z.object({
  slug: z
    .string()
    .min(3, "Slug must be at least 3 characters.")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug may only contain lowercase letters, numbers, and hyphens.",
    ),
  name: z.string().min(1, "Event name is required."),
  description: z.string().optional(),
  timezone: z.string().min(1, "Timezone is required."),
});

export async function createEventAction(
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = createEventSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    timezone: formData.get("timezone") || "UTC",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  let eventId: string;
  try {
    const event = await createEvent(actor, parsed.data);
    eventId = event.id;
  } catch (err) {
    return { error: describeError(err) };
  }
  redirect(`/events/${eventId}/organizer`);
}

const transitionSchema = z.object({
  toState: z.enum([
    "DRAFT",
    "REGISTRATION",
    "SUBMISSIONS_OPEN",
    "SUBMISSIONS_CLOSED",
    "JUDGING",
    "RESULTS_READY",
    "PUBLISHED",
    "ARCHIVED",
  ]),
});

export async function transitionEventAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = transitionSchema.safeParse({ toState: formData.get("toState") });
  if (!parsed.success) {
    return { error: "Invalid target state." };
  }
  return runAction(async () => {
    await transitionEvent(actor, eventId, parsed.data.toState);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}