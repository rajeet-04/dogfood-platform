export * from "./client";

export {
  sql,
  and,
  eq,
  ne,
  or,
  inArray,
  notInArray,
  gt,
  lt,
  gte,
  lte,
  desc,
  asc,
  ilike,
  isNotNull,
  isNull,
} from "drizzle-orm";
export type { SQL } from "drizzle-orm";
export { migrate } from "drizzle-orm/postgres-js/migrator";

export function sqlState(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}
export { EVENT_ROLES, EVENT_STATES } from "./schema/enums";
export type { EventRole, EventState } from "./schema/enums";
export type { CustomQuestion } from "./schema/events";
export type { JudgeApplicationStatus } from "./schema";
export * as schema from "./schema";
