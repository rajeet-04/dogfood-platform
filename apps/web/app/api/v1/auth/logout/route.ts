import { authApi, authJson, clearedSessionCookie } from "../../../../../server/api/auth-cookies";

export async function POST(request: Request): Promise<Response> {
  return authApi(request, async () => authJson({ signedOut: true }, [clearedSessionCookie()]));
}
