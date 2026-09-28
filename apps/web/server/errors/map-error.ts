import { DogfoodError, type ErrorCode } from "@dogfood/validation";

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    requestId: string;
    fields?: Record<string, string>;
  };
};

const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION_FAILED: 422,
  CONFLICT: 409,
  EVENT_STATE_INVALID: 409,
  REGISTRATION_CLOSED: 409,
  DEADLINE_PASSED: 409,
  INVITATION_INVALID: 400,
  TEAM_RULE_VIOLATION: 409,
  SUBMISSION_INCOMPLETE: 422,
  JUDGE_NOT_ASSIGNED: 403,
  TRACK_SCOPE_VIOLATION: 409,
  EVALUATION_LOCKED: 409,
  INVALID_SCORE: 422,
  RUBRIC_INCOMPLETE: 409,
  JUDGING_INCOMPLETE: 409,
  RANKING_NOT_READY: 409,
  RATE_LIMITED: 429,
  SLUG_TAKEN: 409,
};

function cleanMessage(message: string): string {
  return message.replace(/^\[[A-Z_]+\]\s*/, "");
}

/**
 * Drizzle wraps driver failures, so the SQLSTATE lives on a `cause` rather than
 * on the thrown error. Unwrap the chain before looking for a code.
 */
function hasPostgresCode(err: unknown, code: string): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) return false;
    if ((current as { code?: string }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return hasPostgresCode(err, "23505");
}

/**
 * A route segment that is not a valid uuid reaches Postgres as a text literal
 * against a uuid column, which the driver reports as `invalid_text_representation`.
 * Nothing can exist behind that value, so it is a 404 rather than a server
 * fault.
 */
function isPostgresInvalidText(err: unknown): boolean {
  return hasPostgresCode(err, "22P02");
}

export function mapError(
  err: unknown,
  requestId: string,
): { status: number; body: ApiErrorEnvelope } {
  if (err instanceof DogfoodError) {
    const status = STATUS_BY_CODE[err.code] ?? 500;
    const body: ApiErrorEnvelope = {
      error: {
        code: err.code,
        message: cleanMessage(err.message),
        requestId,
      },
    };
    if (err.fields && Object.keys(err.fields).length > 0) {
      body.error.fields = err.fields;
    }
    return { status, body };
  }

  if (isPostgresUniqueViolation(err)) {
    return {
      status: 409,
      body: {
        error: {
          code: "CONFLICT",
          message: "A record with the same unique value already exists",
          requestId,
        },
      },
    };
  }

  if (isPostgresInvalidText(err)) {
    return {
      status: 404,
      body: {
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
          requestId,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: "INTERNAL",
        message: "Internal server error",
        requestId,
      },
    },
  };
}