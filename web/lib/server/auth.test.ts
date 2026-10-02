import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { testDb, truncateAll, type TestDb } from "@/test/db";
import { auditEvents, emailTokens, sessions, users } from "@/db/schema";

const h = vi.hoisted(() => ({
  db: null as unknown,
  outbox: [] as { to: string; subject: string; text: string }[],
  failMail: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("./mail", () => ({
  sendMail: async (m: { to: string; subject: string; text: string }) => {
    if (h.failMail) throw new Error("provider down");
    h.outbox.push(m);
  },
}));

import { completeSignIn, deleteAllSessions, requestSignIn, userForSession, SIGN_IN_TTL_MS } from "./auth";

let db: TestDb;
const linkToken = (text: string) => text.match(/#([A-Za-z0-9_-]+)/)![1];

beforeAll(async () => {
  db = await testDb();
  h.db = db;
});

beforeEach(async () => {
  await truncateAll(db);
  h.outbox.length = 0;
  h.failMail = false;
});

describe("requestSignIn", () => {
  it("emails a link whose token is only stored hashed", async () => {
    expect(await requestSignIn("  Reader@Example.com ", "1.1.1.1")).toEqual({ ok: true });
    expect(h.outbox).toHaveLength(1);
    expect(h.outbox[0].to).toBe("reader@example.com");
    const token = linkToken(h.outbox[0].text);
    const [row] = await db.select().from(emailTokens);
    expect(row.tokenHash).not.toBe(token);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("answers the same way for new and existing accounts", async () => {
    await db.insert(users).values({ email: "known@example.com" });
    const known = await requestSignIn("known@example.com", "1.1.1.1");
    const unknown = await requestSignIn("unknown@example.com", "1.1.1.2");
    expect(known).toEqual(unknown);
    expect(h.outbox.map((m) => m.subject)).toEqual([h.outbox[0].subject, h.outbox[0].subject]);
  });

  it("rejects a malformed address without sending", async () => {
    const res = await requestSignIn("not-an-email", "1.1.1.1");
    expect(res.ok).toBe(false);
    expect(h.outbox).toHaveLength(0);
  });

  it("stops sending to one address after 5 requests an hour but still answers ok", async () => {
    for (let i = 0; i < 7; i++) expect(await requestSignIn("a@example.com", `10.0.0.${i}`)).toEqual({ ok: true });
    expect(h.outbox).toHaveLength(5);
  });

  it("throttles one IP after 20 requests across addresses", async () => {
    for (let i = 0; i < 20; i++) await requestSignIn(`u${i}@example.com`, "9.9.9.9");
    expect(await requestSignIn("next@example.com", "9.9.9.9")).toEqual({ ok: false, reason: "throttled" });
    const throttled = await db.select().from(auditEvents).where(eq(auditEvents.event, "sign_in_throttled"));
    expect(throttled).toHaveLength(1);
  });

  it("reports a mail failure", async () => {
    h.failMail = true;
    expect(await requestSignIn("a@example.com", "1.1.1.1")).toEqual({ ok: false, reason: "mail" });
  });
});

describe("completeSignIn", () => {
  async function tokenFor(email: string) {
    await requestSignIn(email, "1.1.1.1");
    return linkToken(h.outbox.at(-1)!.text);
  }

  it("creates the account on first use and returns a working session", async () => {
    const res = await completeSignIn(await tokenFor("new@example.com"), "1.1.1.1");
    if (!res || res === "throttled") throw new Error("expected a session");
    expect(res.isNew).toBe(true);
    expect(res.user.email).toBe("new@example.com");
    expect((await userForSession(res.sessionToken))?.id).toBe(res.user.id);
  });

  it("signs an existing reader into the same account", async () => {
    const [existing] = await db.insert(users).values({ email: "old@example.com" }).returning();
    const res = await completeSignIn(await tokenFor("old@example.com"), "1.1.1.1");
    if (!res || res === "throttled") throw new Error("expected a session");
    expect(res.isNew).toBe(false);
    expect(res.user.id).toBe(existing.id);
  });

  it("accepts a link only once", async () => {
    const token = await tokenFor("a@example.com");
    expect(await completeSignIn(token, "1.1.1.1")).toBeTruthy();
    expect(await completeSignIn(token, "1.1.1.1")).toBeNull();
  });

  it("refuses an expired link", async () => {
    const token = await tokenFor("a@example.com");
    await db.update(emailTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await completeSignIn(token, "1.1.1.1")).toBeNull();
    expect(SIGN_IN_TTL_MS).toBe(15 * 60 * 1000);
  });

  it("spends the other outstanding links for that address", async () => {
    const first = await tokenFor("a@example.com");
    const second = await tokenFor("a@example.com");
    expect(await completeSignIn(second, "1.1.1.1")).toBeTruthy();
    expect(await completeSignIn(first, "1.1.1.1")).toBeNull();
  });

  it("refuses made-up and oversized tokens", async () => {
    expect(await completeSignIn("nope", "1.1.1.1")).toBeNull();
    expect(await completeSignIn("x".repeat(500), "1.1.1.1")).toBeNull();
  });

  it("throttles repeated guessing from one IP", async () => {
    for (let i = 0; i < 30; i++) await completeSignIn(`guess${i}`, "6.6.6.6");
    expect(await completeSignIn("guess", "6.6.6.6")).toBe("throttled");
  });
});

describe("sessions", () => {
  it("ignores expired sessions and can revoke all of a reader's sessions", async () => {
    await requestSignIn("a@example.com", "1.1.1.1");
    const res = await completeSignIn(linkToken(h.outbox[0].text), "1.1.1.1");
    if (!res || res === "throttled") throw new Error("expected a session");

    await db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
    expect(await userForSession(res.sessionToken)).toBeNull();

    await db.update(sessions).set({ expiresAt: new Date(Date.now() + 60_000) });
    expect(await userForSession(res.sessionToken)).not.toBeNull();
    await deleteAllSessions(res.user.id);
    expect(await userForSession(res.sessionToken)).toBeNull();
  });

  it("returns nothing without a cookie", async () => {
    expect(await userForSession(undefined)).toBeNull();
  });
});
