"use server";

import { revalidatePath } from "next/cache";
import { and, db, eq, inArray, schema } from "@dogfood/db";
import {
  lockEvaluation,
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
  const rows = await db
    .select({
      id: schema.evaluations.id,
      assignmentId: schema.evaluations.assignmentId,
    })
    .from(schema.evaluations)
    .innerJoin(
      schema.judgeAssignments,
      eq(schema.judgeAssignments.id, schema.evaluations.assignmentId),
    )
    .where(
      and(
        eq(schema.judgeAssignments.eventId, eventId),
        inArray(schema.evaluations.state, ["IN_PROGRESS", "SUBMITTED"]),
      ),
    );
  if (rows.length === 0) {
    return { error: "No submitted evaluations to lock." };
  }
  for (const row of rows) {
    try {
      await lockEvaluation(actor, eventId, row.assignmentId);
    } catch (err) {
      return { error: describeError(err) };
    }
  }
  revalidatePath(`/events/${eventId}/organizer`);
  return { success: `Locked ${rows.length} evaluation${rows.length === 1 ? "" : "s"}.` };
}