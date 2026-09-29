import { resolveSessionAccount } from "@dogfood/auth";
import { DogfoodError, z } from "@dogfood/validation";

import { readJsonBody, throwValidation } from "../../../../../server/api/http";
import { authApi, authJson, savedAccountTokens, sessionCookies } from "../../../../../server/api/auth-cookies";

const schema = z.object({ token: z.string().min(1) });

export async function POST(request: Request): Promise<Response> {
  return authApi(request, async () => {
    const parsed = schema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);
    if (!savedAccountTokens(request).has(parsed.data.token)) {
      throw new DogfoodError("FORBIDDEN", "That account is not saved in this browser");
    }

    const account = await resolveSessionAccount(parsed.data.token);
    if (!account) {
      throw new DogfoodError("UNAUTHENTICATED", "That account session has expired. Log in again.");
    }
    return authJson({
      user: {
        id: account.userId,
        email: account.email,
        displayName: account.displayName,
        isPlatformAdmin: account.isPlatformAdmin,
      },
    }, sessionCookies(account.token));
  });
}
