import { randomUUID } from "node:crypto";

import { resolveSession } from "@dogfood/auth";
import type { Actor } from "@dogfood/shared";
import { DogfoodError, z } from "@dogfood/validation";

import { SESSION_COOKIE } from "../../lib/session-cookie";
import { mapError, type ApiErrorEnvelope } from "../errors/map-error";

export function requestId(): string {
  return randomUUID();
}

export async function getActorFromRequest(
  request: Request,
): Promise<Actor | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== SESSION_COOKIE) continue;
    const rawToken = decodeURIComponent(rest.join("="));
    if (!rawToken) continue;
    return resolveSession(rawToken);
  }
  return null;
}

export async function requireApiActor(request: Request): Promise<Actor> {
  const actor = await getActorFromRequest(request);
  if (!actor) {
    throw new DogfoodError("UNAUTHENTICATED", "Authentication required");
  }
  return actor;
}

export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text ? JSON.parse(text) : {};
  } catch {
    throw new DogfoodError("VALIDATION_FAILED", "Request body must be valid JSON");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new DogfoodError("VALIDATION_FAILED", "Request body must be a JSON object");
  }
  return raw as Record<string, unknown>;
}

export function throwValidation(issues: z.ZodIssue[]): never {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length ? issue.path.join(".") : "body";
    if (!fields[key]) fields[key] = issue.message;
  }
  throw new DogfoodError("VALIDATION_FAILED", "Validation failed", fields);
}

export function json(data: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function errorResponse(err: unknown, id: string): Response {
  const { status, body } = mapError(err, id);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Request-Id": id,
    },
  });
}

export async function api(
  request: Request,
  handler: () => Promise<Response>,
): Promise<Response> {
  const id = request.headers.get("x-request-id") ?? requestId();
  try {
    const response = await handler();
    if (!response.headers.has("X-Request-Id")) {
      response.headers.set("X-Request-Id", id);
    }
    return response;
  } catch (err) {
    return errorResponse(err, id);
  }
}

export type { ApiErrorEnvelope };