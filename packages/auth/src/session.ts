import { createHash, randomBytes } from "node:crypto";

import { and, db, eq, gt, lt, schema } from "@dogfood/db";
import type { Actor } from "@dogfood/shared";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashOpaqueToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createSession(
  userId: string,
): Promise<{ rawToken: string }> {
  const raw = randomBytes(32).toString("base64url");
  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashOpaqueToken(raw),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  return { rawToken: raw };
}

export async function resolveSession(rawToken: string): Promise<Actor | null> {
  const tokenHash = hashOpaqueToken(rawToken);
  const rows = await db
    .select()
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.tokenHash, tokenHash),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  const session = rows[0];
  if (!session) return null;

  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, session.userId))
    .limit(1);
  const user = users[0];
  if (!user) return null;

  void db
    .update(schema.sessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.sessions.id, session.id));

  return { userId: user.id, isPlatformAdmin: user.isPlatformAdmin };
}

export type SessionAccount = {
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  token: string;
};

export async function resolveSessionAccount(
  rawToken: string,
): Promise<SessionAccount | null> {
  const account = await resolveSession(rawToken);
  if (!account) return null;
  const users = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, account.userId))
    .limit(1);
  const user = users[0];
  if (!user) return null;
  return {
    userId: user.id,
    email: user.email,
    displayName: user.displayName,
    isPlatformAdmin: user.isPlatformAdmin,
    token: rawToken,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export async function revokeSessionByToken(rawToken: string): Promise<void> {
  await db
    .delete(schema.sessions)
    .where(eq(schema.sessions.tokenHash, hashOpaqueToken(rawToken)));
}

export async function deleteExpiredSessions(): Promise<number> {
  const rows = await db
    .delete(schema.sessions)
    .where(lt(schema.sessions.expiresAt, new Date()))
    .returning({ id: schema.sessions.id });
  return rows.length;
}