"use server";

import { revalidatePath } from "next/cache";
import { z } from "@dogfood/validation";
import { createTeam, createTeamInvite, leaveTeam } from "@dogfood/teams";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { describeError, runAction } from "./common";

const createTeamSchema = z.object({
  name: z.string().min(1, "Team name is required.").max(80),
});

const joinTeamSchema = z.object({
  inviteCode: z.string().min(4, "Invite code is required.").max(32),
});

export async function createTeamAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = createTeamSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    await createTeam(actor, eventId, parsed.data);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function createTeamInviteAction(
  eventId: string,
  teamId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  try {
    const { rawToken } = await createTeamInvite(actor, teamId, {});
    revalidatePath(`/events/${eventId}/participant`);
    return {
      success: `Invite code: ${rawToken}`,
    };
  } catch (err) {
    return { error: describeError(err) };
  }
}

export async function leaveTeamAction(
  eventId: string,
  teamId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await leaveTeam(actor, teamId);
    revalidatePath(`/events/${eventId}/participant`);
  });
}

export async function joinTeamAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = joinTeamSchema.safeParse({
    inviteCode: formData.get("inviteCode"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    const { joinTeam } = await import("@dogfood/teams");
    await joinTeam(actor, eventId, parsed.data.inviteCode);
    revalidatePath(`/events/${eventId}/participant`);
  });
}