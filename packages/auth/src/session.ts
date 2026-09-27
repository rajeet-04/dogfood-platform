import { createHash, randomBytes } from "node:crypto";

import { and, db, eq, gt, schema } from "@dogfood/db";
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

export async function revokeSession(sessionId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}