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
};

function cleanMessage(message: string): string {
  return message.replace(/^\[[A-Z_]+\]\s*/, "");
}

function isPostgresUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "23505"
  );
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