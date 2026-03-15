import { Pool } from "pg";
import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import path from "path";
import * as schema from "@shared/schema";

let db: NodePgDatabase<typeof schema> | null = null;

if (process.env.DATABASE_URL) {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  db = drizzle(pool, { schema });
} else {
  console.warn("⚠ DATABASE_URL not set — diagnostics will only be logged to console");
}

export async function runMigrations() {
  if (!db) return;
  try {
    await migrate(db, { migrationsFolder: path.resolve("./migrations") });
    console.log("✓ Database migrations applied");
  } catch (err) {
    console.error("✗ Migration failed:", err);
  }
}

export { db };
