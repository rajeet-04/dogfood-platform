import { migrate } from "drizzle-orm/postgres-js/migrator";
import { join } from "node:path";

import { client, db } from "./client";

const migrationsFolder = join(process.cwd(), "src", "migrations");

await migrate(db, { migrationsFolder });
console.log("[db] migrations applied");
await client.end();