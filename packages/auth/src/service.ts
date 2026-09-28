import { db, eq, schema, sqlState } from "@dogfood/db";
import { DogfoodError } from "@dogfood/validation";

import { hashPassword, verifyPassword } from "./password";

export type RegisterInput = {
  email: string;
  password: string;
  displayName: string;
};

export type UserSummary = {
  id: string;
  email: string;
  displayName: string;
};

function toSummary(
  user: typeof schema.users.$inferSelect,
): UserSummary {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

export async function registerUser(input: RegisterInput): Promise<UserSummary> {
  const passwordHash = await hashPassword(input.password);
  try {
    const [user] = await db
      .insert(schema.users)
      .values({
        email: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName,
      })
      .returning();
    return toSummary(user);
  } catch (error) {
    if (sqlState(error) === "23505") {
      throw new DogfoodError("CONFLICT", "An account with this email already exists");
    }
    throw error;
  }
}

export async function authenticateCredentials(input: {
  email: string;
  password: string;
}): Promise<UserSummary> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, input.email.toLowerCase()))
    .limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
    throw new DogfoodError(
      "UNAUTHENTICATED",
      "Invalid email or password",
    );
  }
  return toSummary(user);
}

export async function getUserById(userId: string): Promise<UserSummary> {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) throw new DogfoodError("NOT_FOUND", "User not found");
  return toSummary(user);
}

export {
  createSession,
  resolveSession,
  resolveSessionAccount,
  revokeSession,
  revokeSessionByToken,
  deleteExpiredSessions,
  type SessionAccount,
} from "./session";
export * from "./password";