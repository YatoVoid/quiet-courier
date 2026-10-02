import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { seedPlaces, testDb, truncateAll, type TestDb } from "@/test/db";
import { auditEvents, deliveries, users } from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("./session", () => ({ currentUser: async () => null }));

import { activity, editionPath, failedDeliveries, isAdmin, readerCounts, recentEditions } from "./admin";

let db: TestDb;
const CHICAGO = 4887398;
const ready = {
  name: "Reader",
  localWeather: true,
  placeId: CHICAGO,
  timeZone: "America/Chicago",
  format: "small" as const,
  deliveryEmailVerifiedAt: new Date(),
  termsVersion: "1",
  termsAcceptedAt: new Date(),
};

beforeAll(async () => {
  db = await testDb();
  h.db = db;
  await seedPlaces(db);
});

beforeEach(async () => {
  await truncateAll(db);
});

describe("isAdmin", () => {
  it("only accepts addresses in ADMIN_EMAILS, ignoring case and spaces", () => {
    process.env.ADMIN_EMAILS = " Owner@Example.com , second@example.com";
    expect(isAdmin({ email: "owner@example.com" })).toBe(true);
    expect(isAdmin({ email: "reader@example.com" })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    process.env.ADMIN_EMAILS = "";
    expect(isAdmin({ email: "owner@example.com" })).toBe(false);
  });
});

describe("readerCounts", () => {
  it("counts as receiving only the readers the delivery job would send to", async () => {
    await db.insert(users).values([
      { ...ready, email: "a@example.com", deliveryEmail: "a@kindle.com" },
      { ...ready, email: "b@example.com", deliveryEmail: "b@kindle.com", format: "epub", localWeather: false, placeId: null },
      { ...ready, email: "c@example.com", deliveryEmail: "c@kindle.com", deliveryStatus: "paused" },
      { ...ready, email: "d@example.com", deliveryEmail: "d@gmail.com", deliveryEmailVerifiedAt: null },
      { ...ready, email: "e@example.com", deliveryEmail: "e@kindle.com", localWeather: true, placeId: null },
      { email: "f@example.com" },
    ]);
    expect(await readerCounts()).toEqual({
      accounts: 6, onboarded: 5, receiving: 2, paused: 1, unconfirmed: 1, small: 1, large: 0, epub: 1, general: 1,
    });
  });
});

describe("readerCounts with billing on", () => {
  it("leaves out readers whose trial ended without a subscription", async () => {
    process.env.BILLING_ENABLED = "1";
    const past = new Date(Date.now() - 86_400_000);
    await db.insert(users).values([
      { ...ready, email: "a@example.com", deliveryEmail: "a@kindle.com", trialEndsAt: past },
      { ...ready, email: "b@example.com", deliveryEmail: "b@kindle.com", trialEndsAt: past, subscriptionStatus: "active" },
      { ...ready, email: "c@example.com", deliveryEmail: "c@kindle.com" },
    ]);
    expect((await readerCounts()).receiving).toBe(2);
    process.env.BILLING_ENABLED = "0";
    expect((await readerCounts()).receiving).toBe(3);
  });
});

describe("activity", () => {
  it("counts the last 30 days of account events and finished deliveries", async () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const [u] = await db.insert(users).values({ ...ready, email: "a@example.com", deliveryEmail: "a@kindle.com" }).returning();
    await db.insert(auditEvents).values([
      { event: "account_created", createdAt: new Date("2026-10-19T00:00:00Z") },
      { event: "account_created", createdAt: new Date("2026-08-01T00:00:00Z") },
      { event: "terms_accepted", createdAt: new Date("2026-10-19T00:00:00Z") },
      { event: "account_deleted", createdAt: new Date("2026-10-10T00:00:00Z") },
    ]);
    await db.insert(deliveries).values([
      { userId: u.id, editionDate: "2026-10-18", editionKey: "general", format: "small", status: "sent" },
      { userId: u.id, editionDate: "2026-10-19", editionKey: "general", format: "small", status: "sent" },
      { userId: u.id, editionDate: "2026-10-20", editionKey: "general", format: "small", status: "failed", error: "bounced" },
      { userId: u.id, editionDate: "2026-08-01", editionKey: "general", format: "small", status: "failed" },
    ]);
    const a = await activity(30, now);
    expect(a).toMatchObject({ signups: 1, setupsFinished: 1, deleted: 1, sent: 2, failed: 1 });
    expect(a.successRate).toBeCloseTo(2 / 3);
    const failed = await failedDeliveries();
    expect(failed.map((f) => [f.date, f.error])).toEqual([["2026-10-20", "bounced"], ["2026-08-01", null]]);
  });

  it("has no success rate before anything is sent", async () => {
    expect((await activity(30)).successRate).toBeNull();
  });
});

describe("editions", () => {
  it("lists built files and refuses paths outside the editions folder", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "editions-"));
    process.env.EDITIONS_DIR = dir;
    mkdirSync(path.join(dir, "2026-10-02", "general"), { recursive: true });
    mkdirSync(path.join(dir, "2026-10-02", "core"), { recursive: true });
    writeFileSync(path.join(dir, "2026-10-02", "general", "general_small.pdf"), "pdf");
    writeFileSync(path.join(dir, "2026-10-02", "general", "general.epub"), "epub");
    writeFileSync(path.join(dir, "2026-10-02", "core", "core.json"), "{}");

    expect(await recentEditions()).toEqual([
      { date: "2026-10-02", key: "general", files: [{ name: "general_small.pdf", bytes: 3 }, { name: "general.epub", bytes: 4 }] },
    ]);
    expect(editionPath("2026-10-02", "general", "general_small.pdf")).toBe(path.join(dir, "2026-10-02", "general", "general_small.pdf"));
    expect(editionPath("2026-10-02", "general", "../../etc/passwd")).toBeNull();
    expect(editionPath("..", "general", "general_small.pdf")).toBeNull();
    expect(editionPath("2026-10-02", "..", "general_small.pdf")).toBeNull();
    expect(editionPath("2026-10-02", "general", "gn-1_small.pdf")).toBeNull();
    expect(editionPath("2026-10-02", "core", "core.json")).toBeNull();
  });
});
