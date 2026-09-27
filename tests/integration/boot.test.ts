import { describe, expect, it } from "vitest";

import { db, sql } from "@dogfood/db";

describe("database boot", () => {
  it("connects using DATABASE_URL and executes select 1", async () => {
    const rows = await db.execute(sql`select 1 as one`);
    expect(rows[0]?.one).toBe(1);
  });
});