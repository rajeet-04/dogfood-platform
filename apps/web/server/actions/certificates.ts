"use server";

import { revalidatePath } from "next/cache";
import {
  issueCertificates,
  revokeCertificates,
} from "@dogfood/certificates";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

export async function issueCertificatesAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await issueCertificates(actor, eventId);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/certificates`);
    revalidatePath(`/events/${eventId}`);
  });
}

export async function revokeCertificatesAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await revokeCertificates(actor, eventId);
    revalidatePath(`/events/${eventId}/organizer`);
    revalidatePath(`/events/${eventId}/certificates`);
  });
}