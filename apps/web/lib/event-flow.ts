import type { BadgeTone } from "../components/badge";

export const EVENT_STATE_SEQUENCE = [
  "DRAFT",
  "REGISTRATION",
  "SUBMISSIONS_OPEN",
  "SUBMISSIONS_CLOSED",
  "JUDGING",
  "RESULTS_READY",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export type EventStateLabel = (typeof EVENT_STATE_SEQUENCE)[number];

export function nextEventState(state: string): EventStateLabel | null {
  const index = EVENT_STATE_SEQUENCE.indexOf(
    state as EventStateLabel,
  );
  if (index === -1 || index === EVENT_STATE_SEQUENCE.length - 1) return null;
  return EVENT_STATE_SEQUENCE[index + 1];
}

export const EVENT_STATE_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  REGISTRATION: "Registration",
  SUBMISSIONS_OPEN: "Submissions open",
  SUBMISSIONS_CLOSED: "Submissions closed",
  JUDGING: "Judging",
  RESULTS_READY: "Results ready",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export const EVENT_STATE_TONE: Record<string, BadgeTone> = {
  DRAFT: "slate",
  REGISTRATION: "emerald",
  SUBMISSIONS_OPEN: "sky",
  SUBMISSIONS_CLOSED: "blue",
  JUDGING: "indigo",
  RESULTS_READY: "violet",
  PUBLISHED: "emerald",
  ARCHIVED: "slate",
};

export const EVENT_ROLE_TONE: Record<string, BadgeTone> = {
  PARTICIPANT: "sky",
  JUDGE: "indigo",
  ORGANIZER: "violet",
};
