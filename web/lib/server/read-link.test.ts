import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { seedPlaces, testDb, truncateAll, type TestDb } from "@/test/db";
import { auditEvents, deliveries, users, type User } from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("@/lib/server/session", () => ({ clientIp: async () => "9.9.9.9" }));

import { openReadLink, readLinkUrl, readToken, readyEditions, resetReadLink } from "./read-link";
import { GET as latest } from "@/app/read/[token]/route";
import { GET as byDate } from "@/app/read/[token]/[date]/route";
import { GET as opds } from "@/app/read/[token]/opds/route";

let db: TestDb;
let user: User;
const KEY = "gn-4887398";
const fresh = async () => (await db.select().from(users).where(eq(users.id, user.id)))[0];
const call = <P,>(handler: (r: Request, c: { params: Promise<P> }) => Promise<Response>, params: P) =>
  handler(new Request("http://localhost/read"), { params: Promise.resolve(params) });

async function deliver(userId: string, date: string, status: "sent" | "failed" = "sent", key = KEY) {
  await db.insert(deliveries).values({
    userId, editionDate: date, editionKey: key, format: "epub", status, attempts: 1,
    sentAt: status === "sent" ? new Date(`${date}T10:00:00Z`) : null,
  });
}

beforeAll(async () => {
  db = await testDb();
  h.db = db;
  await seedPlaces(db);
  const dir = mkdtempSync(path.join(tmpdir(), "editions-"));
  for (const date of ["2026-10-02", "2026-10-03"]) {
    mkdirSync(path.join(dir, date, KEY), { recursive: true });
    writeFileSync(path.join(dir, date, KEY, `${KEY}.epub`), `epub ${date}`);
  }
  mkdirSync(path.join(dir, "2026-10-04", "general"), { recursive: true });
  writeFileSync(path.join(dir, "2026-10-04", "general", "general.epub"), "someone else's");
  process.env.EDITIONS_DIR = dir;
});

beforeEach(async () => {
  await truncateAll(db);
  [user] = await db
    .insert(users)
    .values({ email: "kobo@example.com", deliveryMethod: "download", format: "epub", timeZone: "America/Chicago" })
    .returning();
});

afterEach(() => {
  process.env.BILLING_ENABLED = "0";
});

describe("read link", () => {
  it("opens for its own reader and nobody else", async () => {
    const token = readToken(user);
    expect(token).toMatch(/^[A-Za-z0-9_-]{46}$/);
    expect(readLinkUrl(user)).toBe(`http://localhost:3000/read/${token}`);
    expect(await openReadLink(token, "1.1.1.1")).toMatchObject({ ok: true, user: { id: user.id } });

    const [other] = await db.insert(users).values({ email: "other@example.com" }).returning();
    const forged = readToken(other).slice(0, 22) + token.slice(22);
    expect(await openReadLink(forged, "1.1.1.1")).toEqual({ ok: false, reason: "unknown" });
    expect(await openReadLink("not-a-token", "1.1.1.1")).toEqual({ ok: false, reason: "unknown" });
  });

  it("stops working once the reader makes a new one", async () => {
    const old = readToken(user);
    await resetReadLink(user, "1.1.1.1");
    const updated = await fresh();
    expect(updated.readLinkVersion).toBe(2);
    expect(await openReadLink(old, "1.1.1.1")).toEqual({ ok: false, reason: "unknown" });
    expect(await openReadLink(readToken(updated), "1.1.1.1")).toMatchObject({ ok: true });
    const events = await db.select().from(auditEvents).where(eq(auditEvents.event, "read_link_reset"));
    expect(events).toHaveLength(1);
  });

  it("throttles an address that keeps guessing", async () => {
    for (let i = 0; i < 20; i++) await openReadLink("x".repeat(46), "6.6.6.6");
    expect(await openReadLink(readToken(user), "6.6.6.6")).toEqual({ ok: false, reason: "throttled" });
    expect(await openReadLink(readToken(user), "7.7.7.7")).toMatchObject({ ok: true });
  });

  it("refuses once the free trial has ended without a subscription", async () => {
    process.env.BILLING_ENABLED = "1";
    await db.update(users).set({ trialEndsAt: new Date(Date.now() - 1000) }).where(eq(users.id, user.id));
    expect(await openReadLink(readToken(user), "1.1.1.1")).toEqual({ ok: false, reason: "ended" });
    await db.update(users).set({ subscriptionStatus: "active" }).where(eq(users.id, user.id));
    expect(await openReadLink(readToken(user), "1.1.1.1")).toMatchObject({ ok: true });
  });
});

describe("readyEditions", () => {
  it("lists only this reader's delivered papers whose files still exist, newest first", async () => {
    await deliver(user.id, "2026-10-02");
    await deliver(user.id, "2026-10-03");
    await deliver(user.id, "2026-10-01");
    await deliver(user.id, "2026-10-05", "failed");
    const [other] = await db.insert(users).values({ email: "other@example.com" }).returning();
    await deliver(other.id, "2026-10-04", "sent", "general");
    const ready = await readyEditions(user.id);
    expect(ready.map((e) => e.date)).toEqual(["2026-10-03", "2026-10-02"]);
  });

  it("includes a paper whose email failed, so the backup link in that email works", async () => {
    await deliver(user.id, "2026-10-02");
    await deliver(user.id, "2026-10-03", "failed");
    expect((await readyEditions(user.id)).map((e) => e.date)).toEqual(["2026-10-03", "2026-10-02"]);
  });

  it("never builds a path from a key the pipeline wouldn't write", async () => {
    await deliver(user.id, "2026-10-03", "sent", "../../etc");
    expect(await readyEditions(user.id)).toEqual([]);
  });
});

describe("read routes", () => {
  it("serves the latest paper as a private download and logs it", async () => {
    await deliver(user.id, "2026-10-02");
    await deliver(user.id, "2026-10-03");
    const res = await call(latest, { token: readToken(user) });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("epub 2026-10-03");
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="The Quiet Courier 2026-10-03.epub"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.event, "edition_downloaded"));
    expect(event.detail).toEqual({ date: "2026-10-03", format: "epub" });
  });

  it("serves an earlier date and refuses one that isn't this reader's", async () => {
    await deliver(user.id, "2026-10-02");
    expect(await (await call(byDate, { token: readToken(user), date: "2026-10-02" })).text()).toBe("epub 2026-10-02");
    expect((await call(byDate, { token: readToken(user), date: "2026-10-04" })).status).toBe(404);
  });

  it("explains when the first paper isn't ready and when the link is wrong", async () => {
    const waiting = await call(latest, { token: readToken(user) });
    expect(waiting.status).toBe(404);
    expect(await waiting.text()).toContain("5 a.m.");
    const wrong = await call(latest, { token: "y".repeat(46) });
    expect(wrong.status).toBe(404);
    expect(await wrong.text()).toContain("/account");
  });

  it("lists the papers as an OPDS acquisition feed", async () => {
    await deliver(user.id, "2026-10-02");
    await deliver(user.id, "2026-10-03");
    const res = await call(opds, { token: readToken(user) });
    expect(res.headers.get("content-type")).toContain("profile=opds-catalog;kind=acquisition");
    const body = await res.text();
    expect(body.match(/<entry>/g)).toHaveLength(2);
    expect(body).toContain("The Quiet Courier, Saturday, October 3, 2026");
    expect(body).toContain(
      `<link rel="http://opds-spec.org/acquisition" href="${readLinkUrl(user)}/2026-10-03" type="application/epub+zip" length="15"/>`,
    );
  });
});
