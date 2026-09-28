"use server";

import { revalidatePath } from "next/cache";

import { addCustomQuestion, addEventTrack, moveCustomQuestion, moveEventTrack, removeCustomQuestion, removeEventTrack, updateCustomQuestion, updateEventTrack } from "@dogfood/events";
import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

function questionInput(formData: FormData) {
  return {
    prompt: String(formData.get("prompt") ?? ""),
    required: formData.get("required") === "on",
    visibility: formData.get("visibility") === "PUBLIC" ? "PUBLIC" as const : "ORGANIZER_ONLY" as const,
  };
}

export async function addTrackAction(eventId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await addEventTrack(actor, eventId, String(formData.get("name") ?? ""));
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function updateTrackAction(eventId: string, trackId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateEventTrack(actor, eventId, trackId, String(formData.get("name") ?? ""));
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function moveTrackAction(eventId: string, trackId: string, direction: "UP" | "DOWN", _prev: FormState | undefined, _formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await moveEventTrack(actor, eventId, trackId, direction);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function removeTrackAction(eventId: string, trackId: string, _prev: FormState | undefined, _formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await removeEventTrack(actor, eventId, trackId);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function addQuestionAction(eventId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await addCustomQuestion(actor, eventId, questionInput(formData));
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function updateQuestionAction(eventId: string, questionId: string, _prev: FormState | undefined, formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await updateCustomQuestion(actor, eventId, questionId, questionInput(formData));
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function moveQuestionAction(eventId: string, questionId: string, direction: "UP" | "DOWN", _prev: FormState | undefined, _formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await moveCustomQuestion(actor, eventId, questionId, direction);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function removeQuestionAction(eventId: string, questionId: string, _prev: FormState | undefined, _formData: FormData): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await removeCustomQuestion(actor, eventId, questionId);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/participant`);
  });
}
