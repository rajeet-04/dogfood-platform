"use server";

import { revalidatePath } from "next/cache";
import { z } from "@dogfood/validation";
import {
  createProject,
  reviseProject,
  submitProject,
  withdrawProject,
} from "@dogfood/submissions";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

const projectSchema = z.object({
  title: z.string().min(1, "Title is required.").max(200),
  tagline: z.string().max(300).optional(),
  description: z.string().min(1, "Description is required."),
  repositoryUrl: z.string().url("Enter a valid URL.").optional().or(z.literal("")),
  liveUrl: z.string().url("Enter a valid URL.").optional().or(z.literal("")),
  demoVideoUrl: z
    .string()
    .url("Enter a valid URL.")
    .optional()
    .or(z.literal("")),
  techTags: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((t) => t.trim()).filter(Boolean) : []),
    z.array(z.string()),
  ),
});

function parseProjectFields(formData: FormData) {
  return {
    title: formData.get("title"),
    tagline: formData.get("tagline") || undefined,
    description: formData.get("description"),
    repositoryUrl: formData.get("repositoryUrl") || undefined,
    liveUrl: formData.get("liveUrl") || undefined,
    demoVideoUrl: formData.get("demoVideoUrl") || undefined,
    techTags: formData.get("techTags") || undefined,
  };
}

export async function createProjectAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const teamId = formData.get("teamId");
  if (typeof teamId !== "string" || !teamId) {
    return { error: "Missing team." };
  }
  const parsed = projectSchema.safeParse(parseProjectFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    await createProject(actor, eventId, { teamId, ...parsed.data, techTags: parsed.data.techTags });
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function reviseProjectAction(
  eventId: string,
  projectId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = projectSchema.safeParse(parseProjectFields(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    await reviseProject(actor, eventId, projectId, parsed.data);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function submitProjectAction(
  eventId: string,
  projectId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await submitProject(actor, eventId, projectId);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function withdrawProjectAction(
  eventId: string,
  projectId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await withdrawProject(actor, eventId, projectId);
    revalidatePath(`/events/${eventId}/participant`);
  });
}