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
import {
  MAX_UPLOAD_BYTES,
  deleteUpload,
  saveUpload,
} from "../../lib/uploads";
import { requireActor } from "../session";
import { runAction } from "./common";

const rationaleSchema = z.object({
  rationale: z.string().max(2000, "Keep it under 2000 characters.").optional(),
});

const UPLOAD_ERRORS: Record<string, string> = {
  EMPTY_UPLOAD: "Choose a file to attach.",
  UPLOAD_TOO_LARGE: `Attachments must be ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB or smaller.`,
  UPLOAD_TYPE_NOT_ALLOWED:
    "Attach a PDF, Word document, plain text file, PNG, or JPEG.",
};

async function readAttachment(
  formData: FormData,
  eventId: string,
): Promise<{ name: string; path: string; size: number; contentType: string } | null> {
  const entry = formData.get("attachment");
  if (!(entry instanceof File) || entry.size === 0) return null;
  return saveUpload(entry, `judge-applications/${eventId}`);
}

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

  let attachment: Awaited<ReturnType<typeof readAttachment>> = null;
  try {
    attachment = await readAttachment(formData, eventId);
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    return { error: UPLOAD_ERRORS[code] ?? "That file could not be uploaded." };
  }

  return runAction(async () => {
    try {
      await applyAsJudge(actor, eventId, {
        rationale: parsed.data.rationale,
        attachment,
      });
    } catch (err) {
      if (attachment) await deleteUpload(attachment.path);
      throw err;
    }
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