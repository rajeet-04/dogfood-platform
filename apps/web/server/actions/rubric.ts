"use server";

import { revalidatePath } from "next/cache";
import { z } from "@dogfood/validation";
import {
  activateRubric,
  addCriterion,
  assignJudge,
  createRubric,
} from "@dogfood/judging";

import type { FormState } from "../../lib/form-state";
import { requireActor } from "../session";
import { describeError, runAction } from "./common";

const rubricSchema = z.object({
  name: z.string().min(1, "Rubric name is required.").max(120),
});

const criterionSchema = z.object({
  name: z.string().min(1, "Criterion name is required.").max(120),
  description: z.string().optional(),
  weight: z.preprocess((v) => Number(v), z.number().finite()),
  minScore: z.preprocess((v) => Number(v), z.number().finite()),
  maxScore: z.preprocess((v) => Number(v), z.number().finite()),
  optional: z
    .union([z.literal("on"), z.literal("true")])
    .nullish()
    .transform((v) => v !== undefined && v !== null),
});

const assignmentSchema = z.object({
  judgeId: z.string().min(1, "Choose a judge."),
  projectId: z.string().min(1, "Choose a project."),
});

export async function createRubricAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = rubricSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  try {
    await createRubric(actor, eventId, parsed.data);
    revalidatePath(`/events/${eventId}/organizer`);
    return { success: "Rubric created." };
  } catch (err) {
    return { error: describeError(err) };
  }
}

export async function addCriterionAction(
  eventId: string,
  rubricId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = criterionSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    weight: formData.get("weight"),
    minScore: formData.get("minScore"),
    maxScore: formData.get("maxScore"),
    optional: formData.get("optional"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    await addCriterion(actor, rubricId, parsed.data);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function activateRubricAction(
  eventId: string,
  rubricId: string,
  _prev: FormState | undefined,
  _formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  return runAction(async () => {
    await activateRubric(actor, eventId, rubricId);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}

export async function assignJudgeAction(
  eventId: string,
  _prev: FormState | undefined,
  formData: FormData,
): Promise<FormState | undefined> {
  const actor = await requireActor();
  const parsed = assignmentSchema.safeParse({
    judgeId: formData.get("judgeId"),
    projectId: formData.get("projectId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  return runAction(async () => {
    await assignJudge(actor, eventId, parsed.data);
    revalidatePath(`/events/${eventId}/organizer`);
  });
}