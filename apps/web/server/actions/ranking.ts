"use server";

import { revalidatePath } from "next/cache";
import {
  generateRankingSnapshot,
  publishRankingSnapshot,
  type TieBreaker,
} from "@dogfood/ranking";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { runAction } from "./common";

const DEFAULT_RANKING_CONFIG = {
  normalizationStrategy: "z-score" as const,
  minimumBatchSize: 1,
  tieBreakers: ["secondary-score", "project-id"] as TieBreaker[],
};

export async function generateRankingAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await generateRankingSnapshot(actor, eventId, DEFAULT_RANKING_CONFIG);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function publishRankingAction(
  eventId: string,
  snapshotId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await publishRankingSnapshot(actor, eventId, snapshotId);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}