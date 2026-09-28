"use server";

import { revalidatePath } from "next/cache";
import { lockAllProjects, lockProject } from "@dogfood/submissions";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

export async function lockProjectAction(
  eventId: string,
  projectId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await lockProject(actor, eventId, projectId);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function lockAllProjectsAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await lockAllProjects(actor, eventId);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}