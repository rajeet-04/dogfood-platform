import { createSession, registerUser } from "@dogfood/auth";
import { z } from "@dogfood/validation";

import { readJsonBody, throwValidation } from "../../../../../server/api/http";
import { authApi, authJson, rememberAccountCookie, sessionCookies } from "../../../../../server/api/auth-cookies";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  return authApi(request, async () => {
    const parsed = schema.safeParse(await readJsonBody(request));
    if (!parsed.success) throwValidation(parsed.error.issues);

    const user = await registerUser(parsed.data);
    const { rawToken } = await createSession(user.id);
    const response = authJson({ user }, sessionCookies(rawToken), 201);
    response.headers.append("Set-Cookie", rememberAccountCookie(request, {
      token: rawToken,
      email: user.email,
      displayName: user.displayName,
    }));
    return response;
  });
}
