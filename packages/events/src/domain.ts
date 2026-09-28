import { EVENT_ROLES, EVENT_STATES, type EventRole, type EventState } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

export type { EventRole, EventState };

const TRANSITIONS: Record<EventState, readonly EventState[]> = {
  DRAFT: ["REGISTRATION"],
  REGISTRATION: ["SUBMISSIONS_OPEN"],
  SUBMISSIONS_OPEN: ["SUBMISSIONS_CLOSED"],
  SUBMISSIONS_CLOSED: ["JUDGING"],
  JUDGING: ["RESULTS_READY"],
  RESULTS_READY: ["PUBLISHED"],
  PUBLISHED: ["ARCHIVED"],
  ARCHIVED: ["PUBLISHED"],
};

export function assertEventTransition(from: EventState, to: EventState): void {
  if (from === to) return;
  if (!TRANSITIONS[from].includes(to)) {
throw new DogfoodError(
      "EVENT_STATE_INVALID",
      `[EVENT_STATE_INVALID] Cannot transition event ${from} to ${to}`,
    );
  }
}

export function isEventState(value: string): value is EventState {
  return (EVENT_STATES as readonly string[]).includes(value);
}

export function isEventRole(value: string): value is EventRole {
  return (EVENT_ROLES as readonly string[]).includes(value);
}