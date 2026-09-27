import { join } from "node:path";
import { client, db, migrate } from "@dogfood/db";

async function globalSetup(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL =
      "postgresql://dogfood:dogfood@localhost:5432/dogfood_test";
  }

  const folder = join(process.cwd(), "packages", "db", "src", "migrations");
  await migrate(db, { migrationsFolder: folder });
  await client.end();
}

export default globalSetup;