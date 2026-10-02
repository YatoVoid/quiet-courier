import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { seedPlaces, testDb, truncateAll, type TestDb } from "@/test/db";
import { auditEvents, sessions, users, type User } from "@/db/schema";
import { TERMS_VERSION } from "@/lib/site";

const h = vi.hoisted(() => ({
  db: null as unknown,
  outbox: [] as { to: string; subject: string; text: string; attachments?: { filename: string; content: Buffer }[] }[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("./mail", () => ({ sendMail: async (m: (typeof h.outbox)[number]) => void h.outbox.push(m) }));

import { confirmDeliveryEmail, deleteAccount, saveProfile, sendTestEdition, setDeliveryStatus } from "./account";
import { createSession, userForSession } from "./auth";

let db: TestDb;
let user: User;
const fresh = async () => (await db.select().from(users).where(eq(users.id, user.id)))[0];
const linkToken = (text: string) => text.match(/#([A-Za-z0-9_-]+)/)![1];
const CHICAGO = "4887398";
const valid = { name: "Ada Reader", weather: "local", placeId: CHICAGO, format: "small", deliveryEmail: "ada_42@kindle.com" };

beforeAll(async () => {
  db = await testDb();
  h.db = db;
  await seedPlaces(db);
  const dir = mkdtempSync(path.join(tmpdir(), "editions-"));
  const chicago = `gn-${CHICAGO}`;
  mkdirSync(path.join(dir, "2026-09-30", chicago), { recursive: true });
  mkdirSync(path.join(dir, "2026-10-01", chicago), { recursive: true });
  mkdirSync(path.join(dir, "2026-10-01", "general"), { recursive: true });
  writeFileSync(path.join(dir, "2026-09-30", chicago, `${chicago}_small.pdf`), "old");
  writeFileSync(path.join(dir, "2026-10-01", chicago, `${chicago}_small.pdf`), "new");
  writeFileSync(path.join(dir, "2026-10-01", "general", "general_large.pdf"), "general");
  writeFileSync(path.join(dir, "denver.epub"), "sample");
  process.env.EDITIONS_DIR = dir;
});

beforeEach(async () => {
  await truncateAll(db);
  h.outbox.length = 0;
  [user] = await db.insert(users).values({ email: "ada@example.com" }).returning();
});

describe("saveProfile", () => {
  it("requires the terms box during onboarding and records the version", async () => {
    const refused = await saveProfile(user, valid, "1.1.1.1", { requireTerms: true });
    expect(refused).toEqual({ ok: false, errors: { acceptTerms: expect.any(String) } });
    expect((await fresh()).termsAcceptedAt).toBeNull();

    await saveProfile(user, { ...valid, acceptTerms: true }, "1.1.1.1", { requireTerms: true });
    const saved = await fresh();
    expect(saved.termsVersion).toBe(TERMS_VERSION);
    expect(saved.termsAcceptedAt).toBeInstanceOf(Date);
    expect(saved.name).toBe("Ada Reader");
  });

  it("stores the place and takes its time zone", async () => {
    await saveProfile(user, valid, "1.1.1.1", { requireTerms: false });
    const saved = await fresh();
    expect(saved).toMatchObject({ localWeather: true, placeId: 4887398, timeZone: "America/Chicago" });
  });

  it("rejects an unknown place and an unknown format", async () => {
    const res = await saveProfile(user, { ...valid, placeId: "999", format: "scroll" }, "1.1.1.1", { requireTerms: false });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(Object.keys(res.errors).sort()).toEqual(["format"]);
    const noPlace = await saveProfile(user, { ...valid, placeId: "999" }, "1.1.1.1", { requireTerms: false });
    expect(noPlace).toEqual({ ok: false, errors: { placeId: expect.any(String) } });
  });

  it("uses the best match when the city arrives as typed text", async () => {
    await saveProfile(user, { ...valid, placeId: "", placeQuery: "paris, tx" }, "1.1.1.1", { requireTerms: false });
    expect((await fresh()).placeId).toBe(4717560);
  });

  it("follows newly typed text over a stale picked id", async () => {
    await saveProfile(user, { ...valid, placeQuery: "Chicago, Illinois, USA" }, "1.1.1.1", { requireTerms: false });
    expect((await fresh()).placeId).toBe(4887398);
    await saveProfile(await fresh(), { ...valid, placeQuery: "baku" }, "1.1.1.1", { requireTerms: false });
    expect((await fresh()).placeId).toBe(587084);
  });

  it("saves a general edition with a time zone and no place", async () => {
    await saveProfile(user, valid, "1.1.1.1", { requireTerms: false });
    await saveProfile(await fresh(), { ...valid, weather: "none", timeZone: "Asia/Tokyo" }, "1.1.1.1", { requireTerms: false });
    expect(await fresh()).toMatchObject({ localWeather: false, placeId: null, timeZone: "Asia/Tokyo" });
  });

  it("needs a real time zone for a general edition", async () => {
    const res = await saveProfile(user, { ...valid, weather: "none", timeZone: "Mars/Olympus" }, "1.1.1.1", { requireTerms: false });
    expect(res).toEqual({ ok: false, errors: { timeZone: expect.any(String) } });
  });

  it("strips markup and control characters from the name", async () => {
    await saveProfile(user, { ...valid, name: " <b>Ada</b>\u0007  Reader " }, "1.1.1.1", { requireTerms: false });
    expect((await fresh()).name).toBe("bAda/b Reader");
  });

  it("trusts a Kindle address or the account's own address without a confirmation email", async () => {
    await saveProfile(user, valid, "1.1.1.1", { requireTerms: false });
    expect((await fresh()).deliveryEmailVerifiedAt).toBeInstanceOf(Date);
    await saveProfile(user, { ...valid, deliveryEmail: "ADA@example.com" }, "1.1.1.1", { requireTerms: false });
    expect((await fresh()).deliveryEmailVerifiedAt).toBeInstanceOf(Date);
    expect(h.outbox).toHaveLength(0);
  });

  it("asks a third-party address to confirm before anything is sent there", async () => {
    const res = await saveProfile(user, { ...valid, deliveryEmail: "someone@else.com" }, "1.1.1.1", { requireTerms: false });
    expect(res).toEqual({ ok: true, verificationSent: true, verificationThrottled: false });
    expect((await fresh()).deliveryEmailVerifiedAt).toBeNull();
    expect(h.outbox[0].to).toBe("someone@else.com");
    expect(await sendTestEdition(await fresh(), "1.1.1.1")).toBe("unverified");

    expect(await confirmDeliveryEmail(linkToken(h.outbox[0].text), "1.1.1.1")).toBe(true);
    expect((await fresh()).deliveryEmailVerifiedAt).toBeInstanceOf(Date);
  });

  it("ignores a confirmation for an address the reader has since replaced", async () => {
    await saveProfile(user, { ...valid, deliveryEmail: "first@else.com" }, "1.1.1.1", { requireTerms: false });
    const stale = linkToken(h.outbox[0].text);
    await saveProfile(await fresh(), { ...valid, deliveryEmail: "second@else.com" }, "1.1.1.1", { requireTerms: false });
    expect(await confirmDeliveryEmail(stale, "1.1.1.1")).toBe(false);
    expect((await fresh()).deliveryEmailVerifiedAt).toBeNull();
  });
});

describe("sendTestEdition", () => {
  beforeEach(async () => {
    await saveProfile(user, valid, "1.1.1.1", { requireTerms: false });
  });

  it("sends the newest built edition for the reader's city and size", async () => {
    expect(await sendTestEdition(await fresh(), "1.1.1.1")).toBe("sent");
    expect(h.outbox[0].to).toBe("ada_42@kindle.com");
    expect(h.outbox[0].attachments?.[0].content.toString()).toBe("new");
    expect(h.outbox[0].attachments?.[0].filename).toBe("The Quiet Courier 2026-10-01.pdf");
  });

  it("falls back to the general edition, then to a sample", async () => {
    await saveProfile(await fresh(), { ...valid, placeId: "2988507", format: "large" }, "1.1.1.1", { requireTerms: false });
    expect(await sendTestEdition(await fresh(), "1.1.1.1")).toBe("sent");
    expect(h.outbox[0].attachments?.[0].content.toString()).toBe("general");
    expect(h.outbox[0].text).toContain("sample copy");

    await saveProfile(await fresh(), { ...valid, format: "epub" }, "1.1.1.1", { requireTerms: false });
    expect(await sendTestEdition(await fresh(), "1.1.1.1")).toBe("sent");
    expect(h.outbox[1].attachments?.[0].content.toString()).toBe("sample");
  });

  it("allows three a day", async () => {
    for (let i = 0; i < 3; i++) expect(await sendTestEdition(await fresh(), "1.1.1.1")).toBe("sent");
    expect(await sendTestEdition(await fresh(), "1.1.1.1")).toBe("throttled");
  });
});

describe("pause and delete", () => {
  it("pauses and resumes delivery", async () => {
    await setDeliveryStatus(user, "paused", "1.1.1.1");
    expect((await fresh()).deliveryStatus).toBe("paused");
    await setDeliveryStatus(user, "active", "1.1.1.1");
    expect((await fresh()).deliveryStatus).toBe("active");
  });

  it("deletes the account and its sessions but keeps the audit trail", async () => {
    const { sessionToken } = await createSession(user.id);
    await deleteAccount(user, "1.1.1.1");
    expect(await fresh()).toBeUndefined();
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await userForSession(sessionToken)).toBeNull();
    const trail = await db.select().from(auditEvents).where(eq(auditEvents.userId, user.id));
    expect(trail.map((e) => e.event)).toContain("account_deleted");
  });
});
