"use server";

import { revalidatePath } from "next/cache";
import {
  applyAsJudge,
  approveJudgeApplication,
  deactivateJudge,
  rejectJudgeApplication,
  withdrawJudgeApplication,
} from "@dogfood/applications";
import { z } from "@dogfood/validation";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

const rationaleSchema = z.object({
  rationale: z.string().max(2000, "Keep it under 2000 characters.").optional(),
});

export async function applyAsJudgeAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = rationaleSchema.safeParse({
    rationale: formData.get("rationale") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    await applyAsJudge(actor, eventId, { rationale: parsed.data.rationale });
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function withdrawJudgeApplicationAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await withdrawJudgeApplication(actor, eventId);
    revalidatePath(`/events/${eventId}`);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function decideJudgeApplicationAction(
  eventId: string,
  applicationId: string,
  decision: "approve" | "reject",
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    if (decision === "approve") {
      await approveJudgeApplication(actor, eventId, applicationId);
    } else {
      await rejectJudgeApplication(actor, eventId, applicationId);
    }
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}`);
  });
}

export async function deactivateJudgeAction(
  eventId: string,
  userId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await deactivateJudge(actor, eventId, userId);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}`);
  });
}