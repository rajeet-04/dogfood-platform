export const EVENT_STATES = [
  "DRAFT",
  "REGISTRATION",
  "SUBMISSIONS_OPEN",
  "SUBMISSIONS_CLOSED",
  "JUDGING",
  "RESULTS_READY",
  "PUBLISHED",
  "ARCHIVED",
] as const;

export type EventState = (typeof EVENT_STATES)[number];

export const EVENT_ROLES = ["PARTICIPANT", "JUDGE", "ORGANIZER"] as const;

export type EventRole = (typeof EVENT_ROLES)[number];