"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "@dogfood/validation";
import {
  createEvent,
  transitionEvent,
  updateEventDetails,
  updateEventRegistrationWindow,
} from "@dogfood/events";

import type { FormState } from "../../lib/form-state";
import { parseUtcDatetime, validateWindowOrder } from "../../lib/event-schedule";
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
  registrationOpensAt: z.string().optional(),
  registrationClosesAt: z.string().optional(),
  submissionOpensAt: z.string().optional(),
  submissionClosesAt: z.string().optional(),
  judgingOpensAt: z.string().optional(),
  judgingClosesAt: z.string().optional(),
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
    registrationOpensAt: formData.get("registrationOpensAt"),
    registrationClosesAt: formData.get("registrationClosesAt"),
    submissionOpensAt: formData.get("submissionOpensAt"),
    submissionClosesAt: formData.get("submissionClosesAt"),
    judgingOpensAt: formData.get("judgingOpensAt"),
    judgingClosesAt: formData.get("judgingClosesAt"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  let eventId: string;
  try {
    const windows = {
      registrationOpensAt: parseUtcDatetime(parsed.data.registrationOpensAt ?? null),
      registrationClosesAt: parseUtcDatetime(parsed.data.registrationClosesAt ?? null),
      submissionOpensAt: parseUtcDatetime(parsed.data.submissionOpensAt ?? null),
      submissionClosesAt: parseUtcDatetime(parsed.data.submissionClosesAt ?? null),
      judgingOpensAt: parseUtcDatetime(parsed.data.judgingOpensAt ?? null),
      judgingClosesAt: parseUtcDatetime(parsed.data.judgingClosesAt ?? null),
    };
    const orderError =
      validateWindowOrder(windows.registrationOpensAt, windows.registrationClosesAt, "Registration") ??
      validateWindowOrder(windows.submissionOpensAt, windows.submissionClosesAt, "Submission") ??
      validateWindowOrder(windows.judgingOpensAt, windows.judgingClosesAt, "Judging");
    if (orderError) return { error: orderError };

    const event = await createEvent(actor, { ...parsed.data, ...windows });
    eventId = event.id;
  } catch (err) {
    return { error: describeError(err) };
  }
  redirect(`/events/${eventId}/organizer`);
}

export async function updateRegistrationWindowAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  try {
    const registrationOpensAt = parseUtcDatetime(
      formData.get("registrationOpensAt"),
    );
    const registrationClosesAt = parseUtcDatetime(
      formData.get("registrationClosesAt"),
    );
    const orderError = validateWindowOrder(
      registrationOpensAt,
      registrationClosesAt,
      "Registration",
    );
    if (orderError) return { error: orderError };
    await updateEventRegistrationWindow(actor, eventId, {
      registrationOpensAt,
      registrationClosesAt,
    });
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}`);
    return { success: "Registration window saved." };
  } catch (err) {
    return { error: describeError(err) };
  }
}

const eventDetailsSchema = z.object({
  description: z
    .string()
    .max(5000, "Keep the description under 5000 characters.")
    .optional(),
  websiteUrl: z.string().max(500).optional(),
  prizeInfo: z.string().max(2000, "Keep prize details under 2000 characters.").optional(),
  timeline: z.string().max(2000, "Keep the timeline under 2000 characters.").optional(),
  schedule: z.string().max(2000, "Keep the schedule under 2000 characters.").optional(),
  rules: z.string().max(5000, "Keep the rules under 5000 characters.").optional(),
  maxTeamSize: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value || !value.trim()) return true;
        const parsed = Number(value);
        return Number.isInteger(parsed) && parsed >= 2 && parsed <= 100;
      },
      { message: "Maximum team size must be a whole number between 2 and 100." },
    ),
});

export async function updateEventDetailsAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = eventDetailsSchema.safeParse({
    description: formData.get("description") ?? undefined,
    websiteUrl: formData.get("websiteUrl") ?? undefined,
    prizeInfo: formData.get("prizeInfo") ?? undefined,
    timeline: formData.get("timeline") ?? undefined,
    schedule: formData.get("schedule") ?? undefined,
    rules: formData.get("rules") ?? undefined,
    maxTeamSize: formData.get("maxTeamSize") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const rawMaxTeamSize = parsed.data.maxTeamSize?.trim();
  return runAction(async () => {
    await updateEventDetails(actor, eventId, {
      description: parsed.data.description,
      websiteUrl: parsed.data.websiteUrl,
      prizeInfo: parsed.data.prizeInfo,
      timeline: parsed.data.timeline,
      schedule: parsed.data.schedule,
      rules: parsed.data.rules,
      maxTeamSize: rawMaxTeamSize ? Number(rawMaxTeamSize) : null,
    });
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
  });
}

const transitionSchema = z.object({  toState: z.enum([
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
    revalidatePath(`/events/${eventId}`);
    revalidatePath("/events");
  });
}
