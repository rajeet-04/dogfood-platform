"use server";

import { revalidatePath } from "next/cache";
import {
  lockAllEvaluations,
  lockEvaluation,
  reopenEvaluation,
  saveEvaluationDraft,
  startEvaluation,
  submitEvaluation,
  unassignJudge,
  type EvaluationScoreInput,
} from "@dogfood/judging";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { describeError, runAction } from "./common";

function parseScoreInputs(formData: FormData): {
  scores: EvaluationScoreInput[];
  overallComment: string | null;
} {
  const scores: EvaluationScoreInput[] = [];
  for (const key of Array.from(formData.keys())) {
    if (!key.startsWith("score:")) continue;
    const criterionId = key.slice("score:".length);
    const raw = formData.get(key);
    if (raw === null || raw === "") continue;
    const value = typeof raw === "string" ? Number(raw) : Number.NaN;
    const comment = formData.get(`comment:${criterionId}`);
    scores.push({
      criterionId,
      score: value,
      comment: typeof comment === "string" && comment.length ? comment : null,
    });
  }
  const overall = formData.get("overallComment");
  return {
    scores,
    overallComment: typeof overall === "string" && overall.length ? overall : null,
  };
}

export async function startEvaluationAction(
  eventId: string,
  assignmentId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await startEvaluation(actor, eventId, assignmentId);
    revalidatePath(`/events/${eventId}/judge`);
  });
}

export async function saveEvaluationDraftAction(
  eventId: string,
  assignmentId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const { scores, overallComment } = parseScoreInputs(formData);
  return runAction(async () => {
    await saveEvaluationDraft(actor, eventId, assignmentId, {
      scores,
      overallComment,
    });
    revalidatePath(`/events/${eventId}/judge`);
  });
}

export async function reopenEvaluationAction(
  eventId: string,
  assignmentId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await reopenEvaluation(actor, eventId, assignmentId);
    revalidatePath(`/events/${eventId}/judge`);
  });
}

export async function submitEvaluationAction(
  eventId: string,
  assignmentId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const { scores, overallComment } = parseScoreInputs(formData);
  return runAction(async () => {
    await submitEvaluation(actor, eventId, assignmentId, {
      scores,
      overallComment,
    });
    revalidatePath(`/events/${eventId}/judge`);
  });
}

export async function unassignJudgeAction(
  eventId: string,
  assignmentId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await unassignJudge(actor, eventId, assignmentId);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function lockEvaluationAction(
  eventId: string,
  assignmentId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await lockEvaluation(actor, eventId, assignmentId);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function lockAllSubmissionsAction(
  eventId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  let locked: number;
  try {
    ({ locked } = await lockAllEvaluations(actor, eventId));
  } catch (err) {
    return { error: describeError(err) };
  }
  if (locked === 0) {
    return { error: "No submitted evaluations to lock." };
  }
  revalidatePath(`/events/${eventId}/organizer`);
  return { success: `Locked ${locked} evaluation${locked === 1 ? "" : "s"}.` };
}
