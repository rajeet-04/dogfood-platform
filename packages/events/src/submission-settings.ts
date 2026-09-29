import { randomUUID } from "node:crypto";

import { and, db, eq, schema, type CustomQuestion } from "@dogfood/db";
import { ACTION, requirePermission } from "@dogfood/permissions";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";
import { appendAuditEvent } from "@dogfood/audit";

async function requireOrganizer(actor: Actor, eventId: string) {
  const [event] = await db.select().from(schema.events).where(eq(schema.events.id, eventId)).limit(1);
  if (!event) throw new DogfoodError("NOT_FOUND", "Event not found");
  const roles = await db.select({ role: schema.eventMemberships.role }).from(schema.eventMemberships)
    .where(and(eq(schema.eventMemberships.eventId, eventId), eq(schema.eventMemberships.userId, actor.userId), eq(schema.eventMemberships.isActive, true)));
  requirePermission(actor, ACTION.EVENT_CONFIGURE, {
    eventId, resourceEventId: eventId, roles: roles.map((row) => row.role), eventState: event.state,
  });
  return event;
}

export async function addEventTrack(actor: Actor, eventId: string, name: string) {
  await requireOrganizer(actor, eventId);
  const clean = name.trim();
  if (!clean || clean.length > 100) throw new DogfoodError("VALIDATION_FAILED", "Track name must be 1 to 100 characters");
  const existing = await db.select({ id: schema.eventTracks.id }).from(schema.eventTracks).where(eq(schema.eventTracks.eventId, eventId));
  return db.transaction(async (tx) => {
    const [track] = await tx.insert(schema.eventTracks).values({ eventId, name: clean, sortOrder: existing.length }).returning();
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.track.create", resourceType: "event_track", resourceId: track.id, metadata: { name: track.name } });
    return track;
  });
}

export async function updateEventTrack(actor: Actor, eventId: string, trackId: string, name: string): Promise<void> {
  await requireOrganizer(actor, eventId);
  const clean = name.trim();
  if (!clean || clean.length > 100) throw new DogfoodError("VALIDATION_FAILED", "Track name must be 1 to 100 characters");
  const [track] = await db.select().from(schema.eventTracks)
    .where(and(eq(schema.eventTracks.id, trackId), eq(schema.eventTracks.eventId, eventId))).limit(1);
  if (!track) throw new DogfoodError("NOT_FOUND", "Track not found");
  const [duplicate] = await db.select({ id: schema.eventTracks.id }).from(schema.eventTracks)
    .where(and(eq(schema.eventTracks.eventId, eventId), eq(schema.eventTracks.name, clean)));
  if (duplicate && duplicate.id !== trackId) throw new DogfoodError("CONFLICT", "A track with this name already exists");
  await db.transaction(async (tx) => {
    await tx.update(schema.eventTracks).set({ name: clean }).where(eq(schema.eventTracks.id, trackId));
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.track.update", resourceType: "event_track", resourceId: trackId, metadata: { previousName: track.name, name: clean } });
  });
}

export async function moveEventTrack(actor: Actor, eventId: string, trackId: string, direction: "UP" | "DOWN"): Promise<void> {
  await requireOrganizer(actor, eventId);
  const tracks = await db.select().from(schema.eventTracks)
    .where(eq(schema.eventTracks.eventId, eventId)).orderBy(schema.eventTracks.sortOrder, schema.eventTracks.name);
  const index = tracks.findIndex((track) => track.id === trackId);
  if (index < 0) throw new DogfoodError("NOT_FOUND", "Track not found");
  const other = index + (direction === "UP" ? -1 : 1);
  if (other < 0 || other >= tracks.length) return;
  [tracks[index], tracks[other]] = [tracks[other], tracks[index]];
  await db.transaction(async (tx) => {
    for (const [sortOrder, track] of tracks.entries()) {
      await tx.update(schema.eventTracks).set({ sortOrder }).where(eq(schema.eventTracks.id, track.id));
    }
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.track.reorder", resourceType: "event_track", resourceId: trackId, metadata: { direction } });
  });
}

export async function listEventTracks(actor: Actor, eventId: string) {
  await requireOrganizer(actor, eventId);
  return db.select().from(schema.eventTracks).where(eq(schema.eventTracks.eventId, eventId))
    .orderBy(schema.eventTracks.sortOrder, schema.eventTracks.name);
}

export async function removeEventTrack(actor: Actor, eventId: string, trackId: string): Promise<void> {
  await requireOrganizer(actor, eventId);
  const [track] = await db.select().from(schema.eventTracks)
    .where(and(eq(schema.eventTracks.id, trackId), eq(schema.eventTracks.eventId, eventId))).limit(1);
  if (!track) throw new DogfoodError("NOT_FOUND", "Track not found");
  const [used] = await db.select({ id: schema.projectRevisions.id }).from(schema.projectRevisions)
    .where(eq(schema.projectRevisions.trackId, trackId)).limit(1);
  if (used) throw new DogfoodError("CONFLICT", "A project revision uses this track");
  await db.transaction(async (tx) => {
    await tx.delete(schema.eventTracks).where(eq(schema.eventTracks.id, trackId));
    const tracks = await tx.select().from(schema.eventTracks)
      .where(eq(schema.eventTracks.eventId, eventId)).orderBy(schema.eventTracks.sortOrder, schema.eventTracks.name);
    for (const [sortOrder, remaining] of tracks.entries()) {
      await tx.update(schema.eventTracks).set({ sortOrder }).where(eq(schema.eventTracks.id, remaining.id));
    }
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.track.delete", resourceType: "event_track", resourceId: trackId, metadata: { name: track.name } });
  });
}

export async function addCustomQuestion(
  actor: Actor,
  eventId: string,
  input: { prompt: string; required: boolean; visibility?: CustomQuestion["visibility"] },
): Promise<CustomQuestion> {
  const event = await requireOrganizer(actor, eventId);
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 300) throw new DogfoodError("VALIDATION_FAILED", "Question must be 1 to 300 characters");
  const visibility = input.visibility ?? "ORGANIZER_ONLY";
  if (visibility !== "PUBLIC" && visibility !== "ORGANIZER_ONLY") {
    throw new DogfoodError("VALIDATION_FAILED", "Invalid question visibility");
  }
  const question: CustomQuestion = { id: randomUUID(), prompt, required: input.required, visibility, order: event.customQuestions.length };
  await db.transaction(async (tx) => {
    await tx.update(schema.events).set({ customQuestions: [...event.customQuestions, question], updatedAt: new Date() }).where(eq(schema.events.id, eventId));
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.custom_question.create", resourceType: "custom_question", resourceId: question.id, metadata: { prompt: question.prompt, required: question.required, visibility: question.visibility, order: question.order } });
  });
  return question;
}

export async function listCustomQuestions(actor: Actor, eventId: string): Promise<CustomQuestion[]> {
  const event = await requireOrganizer(actor, eventId);
  return [...event.customQuestions].sort((a, b) => a.order - b.order);
}

export async function updateCustomQuestion(
  actor: Actor,
  eventId: string,
  questionId: string,
  input: { prompt: string; required: boolean; visibility: CustomQuestion["visibility"] },
): Promise<void> {
  const event = await requireOrganizer(actor, eventId);
  const prompt = input.prompt.trim();
  if (!prompt || prompt.length > 300 || !["PUBLIC", "ORGANIZER_ONLY"].includes(input.visibility)) {
    throw new DogfoodError("VALIDATION_FAILED", "Invalid question");
  }
  if (!event.customQuestions.some((question) => question.id === questionId)) throw new DogfoodError("NOT_FOUND", "Question not found");
  const updated = event.customQuestions.find((question) => question.id === questionId)!;
  await db.transaction(async (tx) => {
    await tx.update(schema.events).set({
      customQuestions: event.customQuestions.map((question) => question.id === questionId ? { ...question, prompt, required: input.required, visibility: input.visibility } : question),
      updatedAt: new Date(),
    }).where(eq(schema.events.id, eventId));
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.custom_question.update", resourceType: "custom_question", resourceId: questionId, metadata: { previousPrompt: updated.prompt, prompt, required: input.required, visibility: input.visibility } });
  });
}

export async function moveCustomQuestion(actor: Actor, eventId: string, questionId: string, direction: "UP" | "DOWN"): Promise<void> {
  const event = await requireOrganizer(actor, eventId);
  const questions = [...event.customQuestions].sort((a, b) => a.order - b.order);
  const index = questions.findIndex((question) => question.id === questionId);
  if (index < 0) throw new DogfoodError("NOT_FOUND", "Question not found");
  const other = index + (direction === "UP" ? -1 : 1);
  if (other < 0 || other >= questions.length) return;
  [questions[index], questions[other]] = [questions[other], questions[index]];
  await db.transaction(async (tx) => {
    await tx.update(schema.events).set({
      customQuestions: questions.map((question, order) => ({ ...question, order })),
      updatedAt: new Date(),
    }).where(eq(schema.events.id, eventId));
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.custom_question.reorder", resourceType: "custom_question", resourceId: questionId, metadata: { direction } });
  });
}

export async function removeCustomQuestion(actor: Actor, eventId: string, questionId: string): Promise<void> {
  const event = await requireOrganizer(actor, eventId);
  if (!event.customQuestions.some((question) => question.id === questionId)) throw new DogfoodError("NOT_FOUND", "Question not found");
  await db.transaction(async (tx) => {
    await tx.update(schema.events).set({
      customQuestions: event.customQuestions
        .filter((question) => question.id !== questionId)
        .sort((a, b) => a.order - b.order)
        .map((question, order) => ({ ...question, order })),
      updatedAt: new Date(),
    }).where(eq(schema.events.id, eventId));
    await appendAuditEvent(tx, { eventId, actorId: actor.userId, action: "event.custom_question.delete", resourceType: "custom_question", resourceId: questionId });
  });
}
