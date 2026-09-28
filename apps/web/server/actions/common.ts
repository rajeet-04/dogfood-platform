import { sqlState } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

import type { FormState } from "../../lib/form-state";

const PG_CONSTRAINT_MESSAGES: Record<string, string> = {
  "23503": "A related record no longer exists. Refresh and try again.",
  "23505": "That value is already in use. Please choose a different one.",
};

function isSqlDriverError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "query" in err;
}

export function describeError(err: unknown): string {
  if (err instanceof DogfoodError) return err.message;
  if (typeof err === "object" && err !== null) {
    const state = sqlState(err);
    if (state && PG_CONSTRAINT_MESSAGES[state]) {
      return PG_CONSTRAINT_MESSAGES[state];
    }
  }
  if (err instanceof Error && !isSqlDriverError(err)) return err.message;
  return "Something went wrong.";
}

export function isRedirect(err: unknown): boolean {
  return (
    err instanceof Error &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

export async function runAction(
  fn: () => Promise<void>,
): Promise<FormState | undefined> {
  try {
    await fn();
    return { success: "Saved." };
  } catch (err) {
    if (isRedirect(err)) throw err;
    return { error: describeError(err) };
  }
}