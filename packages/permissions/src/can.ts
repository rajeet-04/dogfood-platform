import type { EventRole, EventState } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";
import { DogfoodError } from "@dogfood/validation";

import type { Action } from "./actions";

export type { Action };

export type PermissionContext = {
  eventId: string;
  resourceEventId: string;
  roles: EventRole[];
  eventState: EventState;
  ownsProject?: boolean;
  isAssigned?: boolean;
  ownsEvaluation?: boolean;
};

export function can(
  actor: Actor,
  action: Action,
  context: PermissionContext,
): boolean {
  if (actor.isPlatformAdmin) return true;

  if (context.resourceEventId !== context.eventId) return false;

  const { roles, ownsProject, isAssigned, ownsEvaluation } = context;

  switch (action) {
    case "event:configure":
    case "event:transition":
    case "track:manage":
    case "prize:manage":
    case "question:manage":
    case "member:invite":
    case "member:remove":
    case "judge_application:manage":
    case "ranking:generate":
    case "export:event":
    case "audit:read":
      return roles.includes("ORGANIZER");

    case "event:join":
    case "judge:apply":
      return true;

    case "team:join":
    case "team:manage":
      return roles.includes("PARTICIPANT");

    case "project:manage":
      return roles.includes("PARTICIPANT") && ownsProject === true;

    case "project:read:public":
      return true;

    case "project:read:assigned":
      if (roles.includes("ORGANIZER")) return true;
      return roles.includes("JUDGE") && isAssigned === true;

    case "evaluation:submit":
      return roles.includes("JUDGE") && isAssigned === true;

    case "evaluation:read":
      if (roles.includes("ORGANIZER")) return true;
      return roles.includes("JUDGE") && ownsEvaluation === true;

    default:
      return false;
  }
}

export function requirePermission(
  actor: Actor,
  action: Action,
  context: PermissionContext,
): void {
  if (!can(actor, action, context)) {
    throw new DogfoodError(
      "FORBIDDEN",
      `[FORBIDDEN] Actor lacks permission for ${action}`,
    );
  }
}