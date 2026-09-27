import { DogfoodError } from "@dogfood/validation";

import type { FormState } from "../../lib/form-state";

export function describeError(err: unknown): string {
  if (err instanceof DogfoodError) return err.message;
  if (err instanceof Error) return err.message;
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