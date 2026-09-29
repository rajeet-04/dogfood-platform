import { beforeEach, describe, expect, it } from "vitest";

import { resolveSession } from "@dogfood/auth";

import { resetDb } from "../fixtures/db";
import * as loginRoute from "../../apps/web/app/api/v1/auth/login/route";
import * as logoutRoute from "../../apps/web/app/api/v1/auth/logout/route";
import * as signOutRoute from "../../apps/web/app/api/v1/auth/sign-out/route";
import * as registerRoute from "../../apps/web/app/api/v1/auth/register/route";
import * as switchRoute from "../../apps/web/app/api/v1/auth/switch/route";

const base = "http://dogfood.local";

function request(method: string, path: string, body?: unknown, cookie?: string): Request {
  const headers = new Headers();
  if (body !== undefined) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
  return new Request(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function cookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

function cookieJar(setCookies: string[], prior = ""): string {
  const jar = new Map(
    prior.split(";").filter(Boolean).map((part) => part.trim().split("=", 2) as [string, string]),
  );
  for (const value of setCookies) {
    const [pair] = value.split(";", 1);
    const separator = pair.indexOf("=");
    jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

describe("account authentication REST API", () => {
  beforeEach(resetDb);

  it("registers, logs in with case-insensitive email, and returns only HttpOnly session cookies", async () => {
    const registered = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "Rest-Auth@example.test",
      password: "password123",
      displayName: "REST account",
    }));
    expect(registered.status).toBe(201);
    expect(registered.headers.get("cache-control")).toBe("no-store");
    const registeredBody = await json(registered);
    expect(registeredBody).toMatchObject({
      user: { email: "rest-auth@example.test", displayName: "REST account" },
    });
    const registrationCookies = cookies(registered);
    expect(registrationCookies).toHaveLength(2);
    expect(registrationCookies.every((value) => value.includes("HttpOnly") && value.includes("SameSite=Lax"))).toBe(true);
    expect(JSON.stringify(registeredBody)).not.toContain("rawToken");

    const loggedIn = await loginRoute.POST(request("POST", "/api/v1/auth/login", {
      email: "REST-AUTH@EXAMPLE.TEST",
      password: "password123",
    }));
    expect(loggedIn.status).toBe(200);
    expect((await json(loggedIn)).user).toMatchObject({ email: "rest-auth@example.test" });
    expect(cookies(loggedIn)).toHaveLength(2);

    const duplicate = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "REST-auth@example.test",
      password: "password123",
      displayName: "Duplicate",
    }));
    expect(duplicate.status).toBe(409);
  });

  it("validates credentials, reports generic login failure, and logs out the active browser session", async () => {
    const invalidRegister = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "bad", password: "short", displayName: "",
    }));
    expect(invalidRegister.status).toBe(422);
    expect(invalidRegister.headers.get("cache-control")).toBe("no-store");

    const invalidLogin = await loginRoute.POST(request("POST", "/api/v1/auth/login", {
      email: "nobody@example.test", password: "wrong-password",
    }));
    expect(invalidLogin.status).toBe(401);
    expect((await json(invalidLogin)).error.message).toBe("Invalid email or password");

    const registered = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "logout@example.test", password: "password123", displayName: "Logout",
    }));
    const jar = cookieJar(cookies(registered));
    const session = jar.match(/(?:^|; )dogfood_session=([^;]+)/)?.[1];
    expect(session).toBeTruthy();
    expect(await resolveSession(session!)).not.toBeNull();

    const loggedOut = await logoutRoute.POST(request("POST", "/api/v1/auth/logout", undefined, jar));
    expect(loggedOut.status).toBe(200);
    expect(await json(loggedOut)).toEqual({ signedOut: true });
    expect(cookies(loggedOut)[0]).toContain("dogfood_session=");
    expect(cookies(loggedOut)[0]).toContain("Max-Age=0");
    expect(await resolveSession(session!)).not.toBeNull();
  });

  it("switches only to an active session saved in the browser account list", async () => {
    const first = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "switch-first@example.test", password: "password123", displayName: "First",
    }));
    const firstJar = cookieJar(cookies(first));
    const firstToken = firstJar.match(/(?:^|; )dogfood_session=([^;]+)/)?.[1];
    const second = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "switch-second@example.test", password: "password123", displayName: "Second",
    }, firstJar));
    const secondJar = cookieJar(cookies(second), firstJar);
    const secondToken = secondJar.match(/(?:^|; )dogfood_session=([^;]+)/)?.[1];

    const switched = await switchRoute.POST(request("POST", "/api/v1/auth/switch", { token: firstToken }, secondJar));
    expect(switched.status).toBe(200);
    expect((await json(switched)).user).toMatchObject({
      email: "switch-first@example.test", displayName: "First",
    });
    expect(cookies(switched)[0]).toContain(`dogfood_session=${firstToken}`);

    const firstAccounts = cookies(first).find((value) => value.startsWith("dogfood_accounts="))?.split(";", 1)[0];
    const denied = await switchRoute.POST(request("POST", "/api/v1/auth/switch", { token: secondToken }, firstAccounts));
    expect(denied.status).toBe(403);
  });

  it("revokes one saved account or every saved account server side", async () => {
    const first = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "signout-first@example.test", password: "password123", displayName: "First",
    }));
    const firstJar = cookieJar(cookies(first));
    const firstToken = firstJar.match(/(?:^|; )dogfood_session=([^;]+)/)?.[1]!;
    const second = await registerRoute.POST(request("POST", "/api/v1/auth/register", {
      email: "signout-second@example.test", password: "password123", displayName: "Second",
    }, firstJar));
    const jar = cookieJar(cookies(second), firstJar);
    const secondToken = jar.match(/(?:^|; )dogfood_session=([^;]+)/)?.[1]!;

    const foreign = await signOutRoute.POST(request("POST", "/api/v1/auth/sign-out", { token: "not-saved" }, jar));
    expect(foreign.status).toBe(403);

    const one = await signOutRoute.POST(request("POST", "/api/v1/auth/sign-out", { token: secondToken }, jar));
    expect(one.status).toBe(200);
    expect(await json(one)).toEqual({ signedOut: 1 });
    expect(await resolveSession(secondToken)).toBeNull();
    expect(await resolveSession(firstToken)).not.toBeNull();
    const afterOne = cookieJar(cookies(one), jar);
    expect(afterOne).toContain(`dogfood_session=${firstToken}`);

    const all = await signOutRoute.POST(request("POST", "/api/v1/auth/sign-out", { all: true }, afterOne));
    expect(all.status).toBe(200);
    expect(await resolveSession(firstToken)).toBeNull();
    expect(cookies(all).some((value) => value.startsWith("dogfood_session=;") && value.includes("Max-Age=0"))).toBe(true);
  });
});
