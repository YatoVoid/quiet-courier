import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

export async function testDb() {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "../db/migrations") });
  return db;
}

export type TestDb = Awaited<ReturnType<typeof testDb>>;

export async function truncateAll(db: TestDb) {
  await db.execute(`truncate users, sessions, email_tokens, rate_events, audit_events restart identity cascade`);
}
