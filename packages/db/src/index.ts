export * from "./client";

export { sql, and, eq, or, inArray, gt, lt, gte, lte, desc, asc } from "drizzle-orm";
export { migrate } from "drizzle-orm/postgres-js/migrator";

export function sqlState(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
export { EVENT_ROLES, EVENT_STATES } from "./schema/enums";
export type { EventRole, EventState } from "./schema/enums";
export type { JudgeApplicationStatus } from "./schema";
export * as schema from "./schema";