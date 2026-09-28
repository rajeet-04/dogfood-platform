import { beforeEach, describe, expect, it } from "vitest";

import { createSession, registerUser } from "@dogfood/auth";
import { db, eq, schema } from "@dogfood/db";
import { createEvent } from "@dogfood/events";
import type { Actor } from "@dogfood/shared";

import { resetDb } from "../fixtures/db";
import * as tracksRoute from "../../apps/web/app/api/v1/events/[eventId]/tracks/route";
import * as trackRoute from "../../apps/web/app/api/v1/events/[eventId]/tracks/[trackId]/route";
import * as trackOrderRoute from "../../apps/web/app/api/v1/events/[eventId]/tracks/[trackId]/order/route";
import * as questionsRoute from "../../apps/web/app/api/v1/events/[eventId]/custom-questions/route";
import * as questionRoute from "../../apps/web/app/api/v1/events/[eventId]/custom-questions/[questionId]/route";
import * as questionOrderRoute from "../../apps/web/app/api/v1/events/[eventId]/custom-questions/[questionId]/order/route";

const base = "http://dogfood.local";
let nextUser = 0;

async function user(label: string) {
  nextUser += 1;
  const account = await registerUser({
    email: `${label}-${Date.now()}-${nextUser}@settings-api.test`,
    password: "password123",
    displayName: label,
  });
  const session = await createSession(account.id);
  return {
    actor: { userId: account.id, isPlatformAdmin: false } satisfies Actor,
    cookie: `dogfood_session=${session.rawToken}`,
  };
}

function request(method: string, path: string, cookie?: string, body?: unknown): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function invoke(
  handler: (request: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
  req: Request,
  params: Record<string, string>,
) {
  const response = await handler(req, { params: Promise.resolve(params) });
  return { response, body: response.status === 204 ? {} : await response.json() as Record<string, any> };
}

describe("submission settings REST API", () => {
  beforeEach(async () => {
    nextUser = 0;
    await resetDb();
  });

  it("lets organizers create, list, update, and reorder tracks and custom questions", async () => {
    const organizer = await user("organizer");
    const participant = await user("participant");
    const event = await createEvent(organizer.actor, {
      slug: `settings-api-${Date.now()}`,
      name: "Settings API",
      timezone: "UTC",
    });
    const tracksPath = `/api/v1/events/${event.id}/tracks`;
    const questionsPath = `/api/v1/events/${event.id}/custom-questions`;
    const eventParams = { eventId: event.id };

    const forbidden = await invoke(tracksRoute.GET, request("GET", tracksPath, participant.cookie), eventParams);
    expect(forbidden.response.status).toBe(403);
    const firstTrack = await invoke(tracksRoute.POST, request("POST", tracksPath, organizer.cookie, { name: "Robotics" }), eventParams);
    const secondTrack = await invoke(tracksRoute.POST, request("POST", tracksPath, organizer.cookie, { name: "Climate" }), eventParams);
    expect(firstTrack.response.status).toBe(201);
    expect(secondTrack.response.status).toBe(201);
    const renamed = await invoke(trackRoute.PATCH, request("PATCH", `${tracksPath}/${secondTrack.body.track.id}`, organizer.cookie, { name: "Energy" }), {
      ...eventParams,
      trackId: secondTrack.body.track.id,
    });
    expect(renamed.response.status).toBe(200);
    expect(renamed.body.track.name).toBe("Energy");
    const movedTrack = await invoke(trackOrderRoute.POST, request("POST", `${tracksPath}/${secondTrack.body.track.id}/order`, organizer.cookie, { direction: "UP" }), {
      ...eventParams,
      trackId: secondTrack.body.track.id,
    });
    expect(movedTrack.response.status).toBe(200);
    const tracks = await invoke(tracksRoute.GET, request("GET", tracksPath, organizer.cookie), eventParams);
    expect(tracks.body.tracks.map((row: { name: string }) => row.name)).toEqual(["Energy", "Robotics"]);

    const firstQuestion = await invoke(questionsRoute.POST, request("POST", questionsPath, organizer.cookie, {
      prompt: "What problem does it solve?",
      required: true,
      visibility: "PUBLIC",
    }), eventParams);
    const secondQuestion = await invoke(questionsRoute.POST, request("POST", questionsPath, organizer.cookie, {
      prompt: "Any private notes?",
      required: false,
    }), eventParams);
    expect(firstQuestion.response.status).toBe(201);
    expect(firstQuestion.body.question).toMatchObject({ required: true, visibility: "PUBLIC", order: 0 });
    expect(secondQuestion.body.question).toMatchObject({ required: false, visibility: "ORGANIZER_ONLY", order: 1 });
    const questionId = firstQuestion.body.question.id as string;
    const updated = await invoke(questionRoute.PATCH, request("PATCH", `${questionsPath}/${questionId}`, organizer.cookie, {
      prompt: "What impact does it have?",
      required: false,
      visibility: "ORGANIZER_ONLY",
    }), { ...eventParams, questionId });
    expect(updated.response.status).toBe(200);
    const movedQuestion = await invoke(questionOrderRoute.POST, request("POST", `${questionsPath}/${questionId}/order`, organizer.cookie, { direction: "DOWN" }), {
      ...eventParams,
      questionId,
    });
    expect(movedQuestion.response.status).toBe(200);
    const questions = await invoke(questionsRoute.GET, request("GET", questionsPath, organizer.cookie), eventParams);
    expect(questions.body.questions.map((row: { id: string; order: number; prompt: string }) => [row.prompt, row.order])).toEqual([
      ["Any private notes?", 0],
      ["What impact does it have?", 1],
    ]);

    const audit = await db.select().from(schema.auditEvents).where(eq(schema.auditEvents.eventId, event.id));
    expect(audit.map((row) => row.action)).toEqual(expect.arrayContaining([
      "event.track.create", "event.track.update", "event.track.reorder",
      "event.custom_question.create", "event.custom_question.update", "event.custom_question.reorder",
    ]));
  });

  it("rejects malformed order and invalid settings without mutating", async () => {
    const organizer = await user("organizer");
    const event = await createEvent(organizer.actor, {
      slug: `settings-validation-${Date.now()}`,
      name: "Settings validation API",
      timezone: "UTC",
    });
    const tracksPath = `/api/v1/events/${event.id}/tracks`;
    const questionsPath = `/api/v1/events/${event.id}/custom-questions`;
    const params = { eventId: event.id };
    const invalidTrack = await invoke(tracksRoute.POST, request("POST", tracksPath, organizer.cookie, { name: "  " }), params);
    expect(invalidTrack.response.status).toBe(422);
    const invalidQuestion = await invoke(questionsRoute.POST, request("POST", questionsPath, organizer.cookie, {
      prompt: "",
      required: true,
      visibility: "EVERYONE",
    }), params);
    expect(invalidQuestion.response.status).toBe(422);
    const invalidDirection = await invoke(trackOrderRoute.POST, request("POST", `${tracksPath}/00000000-0000-4000-8000-000000000001/order`, organizer.cookie, { direction: "SIDEWAYS" }), {
      ...params,
      trackId: "00000000-0000-4000-8000-000000000001",
    });
    expect(invalidDirection.response.status).toBe(422);
  });
});
