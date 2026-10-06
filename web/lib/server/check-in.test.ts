import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, truncateAll, type TestDb } from "@/test/db";
import { auditEvents, users, type User } from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown, outbox: [] as { to: string; subject: string; text: string }[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("./mail", () => ({ sendMail: async (m: (typeof h.outbox)[number]) => void h.outbox.push(m) }));

import { checkInToken, recordCheckIn } from "./check-in";
import { readToken } from "./read-link";

let db: TestDb;
let user: User;
const fresh = async () => (await db.select().from(users).where(eq(users.id, user.id)))[0];

beforeAll(async () => {
  db = await testDb();
  h.db = db;
});

beforeEach(async () => {
  await truncateAll(db);
  h.outbox.length = 0;
  [user] = await db
    .insert(users)
    .values({ email: "ada@example.com", deliveryEmail: "ada_42@kindle.com", format: "small", timeZone: "America/Chicago" })
    .returning();
});

describe("check-in tokens", () => {
  // The same values are asserted in pipeline/tests/test_links.py, which signs the links in the emails.
  it("match what the delivery job signs", () => {
    const id = "0b1e7c2a-3f4d-4e5a-9b6c-7d8e9f0a1b2c";
    expect(checkInToken(id)).toBe("Cx58Kj9NTlqbbH2OnwobLAqekLKk-CUcV7bISQ7BOZ_Ga2");
    expect(readToken({ id, readLinkVersion: 3 })).toBe("Cx58Kj9NTlqbbH2OnwobLAXjreaNDYUt3fCeqYdvFaxWMV");
  });
});

describe("recordCheckIn", () => {
  it("records a yes without bothering anyone", async () => {
    expect(await recordCheckIn(checkInToken(user.id), "yes", "1.1.1.1")).toEqual({ ok: true, answer: "yes" });
    const row = await fresh();
    expect(row.checkInAnswer).toBe("yes");
    expect(row.checkInAnsweredAt).not.toBeNull();
    expect(h.outbox).toEqual([]);
    const [event] = await db.select().from(auditEvents).where(eq(auditEvents.event, "check_in_answered"));
    expect(event.detail).toEqual({ answer: "yes" });
  });

  it("on a no, tells the editor once and hands the reader their download link", async () => {
    const result = await recordCheckIn(checkInToken(user.id), "no", "1.1.1.1");
    expect(result).toMatchObject({ ok: true, answer: "no" });
    expect(result.ok && result.readLink).toContain(`/read/${readToken(user)}`);
    expect(h.outbox).toHaveLength(1);
    expect(h.outbox[0].to).toBe("hello@quietcourier.com");
    expect(h.outbox[0].text).toContain("ada@example.com");
    expect(h.outbox[0].text).toContain("ada_42@kindle.com");

    await recordCheckIn(checkInToken(user.id), "no", "1.1.1.1");
    expect(h.outbox).toHaveLength(1);
  });

  it("refuses a token that isn't signed for this purpose", async () => {
    expect(await recordCheckIn(readToken(user), "no", "1.1.1.1")).toEqual({ ok: false, reason: "unknown" });
    expect(await recordCheckIn("not-a-token", "no", "1.1.1.1")).toEqual({ ok: false, reason: "unknown" });
    expect((await fresh()).checkInAnswer).toBeNull();
    expect(h.outbox).toEqual([]);
  });

  it("stops answering after too many bad tries from one address", async () => {
    for (let i = 0; i < 20; i++) await recordCheckIn("y".repeat(46), "no", "2.2.2.2");
    expect(await recordCheckIn(checkInToken(user.id), "yes", "2.2.2.2")).toEqual({ ok: false, reason: "throttled" });
    expect((await fresh()).checkInAnswer).toBeNull();
  });
});
