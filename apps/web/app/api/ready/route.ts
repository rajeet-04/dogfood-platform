import { db, sql } from "@dogfood/db";

type ReadinessResult = {
  ok: boolean;
  error: string | null;
};

async function checkReadiness(): Promise<ReadinessResult> {
  try {
    const rows = (await db.execute(
      sql`select to_regclass('public.events') as events, to_regclass('drizzle.__drizzle_migrations') as migrations`,
    )) as Array<{ migrations: string | null; events: string | null }>;
    const row = rows[0];
    if (!row) {
      return { ok: false, error: "database returned no rows" };
    }
    if (!row.migrations || !row.events) {
      return { ok: false, error: "migrations have not been applied" };
    }
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "database unreachable" };
  }
}

export async function GET(): Promise<Response> {
  const result = await checkReadiness();
  if (!result.ok) {
    return Response.json(
      { status: "unavailable", database: "unreachable" },
      { status: 503 },
    );
  }
  return Response.json({
    status: "ready",
    database: "ok",
    migrations: "applied",
  });
}