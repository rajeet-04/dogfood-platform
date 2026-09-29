import { resolveSessionAccount, revokeSessionByToken } from "@dogfood/auth";
import { DogfoodError, z } from "@dogfood/validation";

import { readJsonBody, throwValidation } from "../../../../../server/api/http";
import {
  authApi,
  authJson,
  clearedSessionCookie,
  currentSessionToken,
  forgetAccountsCookie,
  savedAccountTokens,
  sessionCookies,
} from "../../../../../server/api/auth-cookies";

const schema = z.union([
  z.object({ token: z.string().min(1) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);

/**
 * Revokes saved browser sessions server side, like the account menu's
 * "Sign out" (one account) and "Sign out of all accounts". Unlike logout,
 * the revoked tokens stop working everywhere.
 */
export async function POST(request: Request): Promise<Response> {
  return authApi(request, async () => {
    const parsed = schema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);

    const saved = savedAccountTokens(request);
    const current = currentSessionToken(request);
    const targets = "all" in parsed.data
      ? new Set([...saved, ...(current ? [current] : [])])
      : new Set([parsed.data.token]);
    if ("token" in parsed.data && !saved.has(parsed.data.token) && parsed.data.token !== current) {
      throw new DogfoodError("FORBIDDEN", "That account is not saved in this browser");
    }

    for (const token of targets) await revokeSessionByToken(token);

    const remaining = [...saved].filter((token) => !targets.has(token));
    const cookies = [forgetAccountsCookie(request, targets)];
    if (!current || targets.has(current)) {
      const fallback = remaining[0] ? await resolveSessionAccount(remaining[0]) : null;
      cookies.push(...(fallback ? sessionCookies(fallback.token) : [clearedSessionCookie()]));
    }
    return authJson({ signedOut: targets.size }, cookies);
  });
}
