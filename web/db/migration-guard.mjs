import { readFileSync } from "node:fs";
import path from "node:path";

const DESTRUCTIVE = [
  /\bDROP\s+(TABLE|SCHEMA|COLUMN|TYPE)\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i,
];

export function destructiveStatements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => DESTRUCTIVE.some((re) => re.test(s)));
}

export function pendingMigrations(migrationsFolder, lastAppliedAt) {
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, "meta", "_journal.json"), "utf8"));
  return journal.entries
    .filter((e) => lastAppliedAt == null || e.when > lastAppliedAt)
    .map((e) => ({ tag: e.tag, sql: readFileSync(path.join(migrationsFolder, `${e.tag}.sql`), "utf8") }));
}

// A destructive migration only runs when ALLOW_DESTRUCTIVE_MIGRATION names it, so it can't ride along with a routine deploy.
export function blockedMigrations(pending, allowTag) {
  return pending
    .map((m) => ({ tag: m.tag, statements: destructiveStatements(m.sql) }))
    .filter((m) => m.statements.length > 0 && m.tag !== allowTag);
}
