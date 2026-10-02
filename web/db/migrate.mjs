import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { blockedMigrations, pendingMigrations } from "./migration-guard.mjs";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 10, onnotice: () => {} });
const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function lastAppliedAt() {
  const [{ exists }] = await client`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`;
  if (!exists) return null;
  const [row] = await client`select max(created_at)::bigint as at from drizzle.__drizzle_migrations`;
  return row.at == null ? null : Number(row.at);
}

try {
  const blocked = blockedMigrations(pendingMigrations(migrationsFolder, await lastAppliedAt()), process.env.ALLOW_DESTRUCTIVE_MIGRATION);
  if (blocked.length) {
    for (const m of blocked) {
      console.error(`refusing migration ${m.tag}, it can delete data:`);
      for (const stmt of m.statements) console.error(`  ${stmt}`);
    }
    console.error("Back up first, then rerun with ALLOW_DESTRUCTIVE_MIGRATION=<tag> for that one migration.");
    process.exit(1);
  }
  await migrate(drizzle(client), { migrationsFolder });
  console.log("migrations up to date");
} catch (err) {
  console.error("migration failed:", err);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
