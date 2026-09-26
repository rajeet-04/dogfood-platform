import { db, sql } from "@dogfood/db";

export async function resetDb(): Promise<void> {
  const result = await db.execute(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = (result as Array<{ tablename: string }>)
    .map((r) => r.tablename)
    .filter((n) => n !== "drizzle_migrations");
  if (names.length > 0) {
    await db.execute(sql.raw(`truncate table ${names.join(", ")} cascade`));
  }
}