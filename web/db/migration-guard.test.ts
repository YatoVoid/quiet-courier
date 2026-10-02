import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { blockedMigrations, destructiveStatements, pendingMigrations } from "./migration-guard.mjs";

describe("destructiveStatements", () => {
  it("passes additive changes", () => {
    const sql = `CREATE TABLE "x" ("id" uuid);\n--> statement-breakpoint\nALTER TABLE "users" ADD COLUMN "notes" text;\n--> statement-breakpoint\nCREATE INDEX "i" ON "x" ("id");`;
    expect(destructiveStatements(sql)).toEqual([]);
  });

  it.each([
    `DROP TABLE "users" CASCADE;`,
    `ALTER TABLE "users" DROP COLUMN "grade";`,
    `TRUNCATE "users";`,
    `DELETE FROM "sessions";`,
    `ALTER TABLE "users" ALTER COLUMN "grade" SET DATA TYPE integer;`,
    `DROP SCHEMA public CASCADE;`,
  ])("flags %s", (stmt) => {
    expect(destructiveStatements(`CREATE TABLE "a" ();\n--> statement-breakpoint\n${stmt}`)).toEqual([stmt]);
  });
});

describe("pendingMigrations and blockedMigrations", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mig-"));
  mkdirSync(path.join(dir, "meta"));
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({ entries: [{ tag: "0000_init", when: 100 }, { tag: "0001_drop_grade", when: 200 }] }),
  );
  writeFileSync(path.join(dir, "0000_init.sql"), `CREATE TABLE "users" ("grade" text);`);
  writeFileSync(path.join(dir, "0001_drop_grade.sql"), `ALTER TABLE "users" DROP COLUMN "grade";`);

  it("treats everything as pending on a fresh database", () => {
    expect(pendingMigrations(dir, null).map((m: { tag: string }) => m.tag)).toEqual(["0000_init", "0001_drop_grade"]);
  });

  it("only returns migrations newer than the last applied one", () => {
    expect(pendingMigrations(dir, 100).map((m: { tag: string }) => m.tag)).toEqual(["0001_drop_grade"]);
    expect(pendingMigrations(dir, 200)).toEqual([]);
  });

  it("blocks a pending destructive migration unless it is named exactly", () => {
    const pending = pendingMigrations(dir, 100);
    expect(blockedMigrations(pending, undefined).map((m: { tag: string }) => m.tag)).toEqual(["0001_drop_grade"]);
    expect(blockedMigrations(pending, "yes")).toHaveLength(1);
    expect(blockedMigrations(pending, "0001_drop_grade")).toEqual([]);
  });
});
