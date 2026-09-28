// Stable error catalog used across HTTP, Server Actions, and services.
// Contract reference: specs/03-engineering-contract.md

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "VALIDATION_FAILED",
  "CONFLICT",
  "EVENT_STATE_INVALID",
  "DEADLINE_PASSED",
  "REGISTRATION_CLOSED",
  "INVITATION_INVALID",
  "TEAM_RULE_VIOLATION",
  "SUBMISSION_INCOMPLETE",
  "JUDGE_NOT_ASSIGNED",
  "TRACK_SCOPE_VIOLATION",
  "EVALUATION_LOCKED",
  "INVALID_SCORE",
  "RUBRIC_INCOMPLETE",
  "JUDGING_INCOMPLETE",
  "RANKING_NOT_READY",
  "RATE_LIMITED",
  "SLUG_TAKEN",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class DogfoodError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message: string, fields?: Record<string, string>) {
    super(message);
    this.name = "DogfoodError";
    this.code = code;
    this.fields = fields;
  }
}

export * from "zod";