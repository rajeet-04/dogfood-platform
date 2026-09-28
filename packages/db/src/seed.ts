import { migrate } from "drizzle-orm/postgres-js/migrator";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { client, db } from "./client";
import { printFixtureAuthHeaders, seedOfficialFixture, type OfficialFixture } from "./fixture-seed";

const migrationsFolder = join(process.cwd(), "src", "migrations");

try {
  await migrate(db, { migrationsFolder });
  console.log("[db] migrations applied");
  if (process.env.DOGFOOD_SEED_FIXTURES === "1") {
    const fixturePath = new URL("../../../fixtures.json", import.meta.url);
    const fixture = JSON.parse(await readFile(fixturePath, "utf8")) as OfficialFixture;
    const seeded = await seedOfficialFixture(fixture);
    await printFixtureAuthHeaders(fixture, seeded);
  }
} finally {
  await client.end();
}
