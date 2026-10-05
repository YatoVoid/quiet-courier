import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { testDb, truncateAll, type TestDb } from "@/test/db";
import { emailTokens, referralClicks, referralConversions, referralLinks, referralPayouts, referrers, stripeEvents, users } from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown, outbox: [] as { to: string; text: string }[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("./mail", () => ({ sendMail: async (m: (typeof h.outbox)[number]) => void h.outbox.push(m) }));

import { accountingCsv, attribute, followLink, monthlyFigures, referrerFigures, statementCsv } from "./referrals";
import { completeSignIn, requestSignIn } from "./auth";
import { handleStripeEvent, setStripeForTests } from "./billing";

const NOW = new Date("2026-11-03T12:00:00Z");
let db: TestDb;
const linkToken = (text: string) => text.match(/#([A-Za-z0-9_-]+)/)![1];
const event = (id: string, type: string, object: unknown) =>
  ({ id, type, created: Math.floor(NOW.getTime() / 1000), data: { object } }) as unknown as Stripe.Event;

const invoicePaymentsByIntent = new Map<string, string>();
const fake = {
  subscriptions: { retrieve: async () => ({ id: "sub_x", customer: "none", status: "active", items: { data: [] } }) },
  invoicePayments: {
    list: async (p: { payment: { payment_intent: string } }) => {
      const invoice = invoicePaymentsByIntent.get(p.payment.payment_intent);
      return { data: invoice ? [{ invoice }] : [] };
    },
  },
};

async function addReferrer(name: string, code: string, extra: Partial<typeof referrers.$inferInsert> = {}) {
  const [r] = await db
    .insert(referrers)
    .values({ name, kind: "individual", payoutCents: 300, startsAt: new Date("2026-10-01T00:00:00Z"), ...extra })
    .returning();
  await db.insert(referralLinks).values({ code, referrerId: r.id });
  return r;
}

async function referredReader(email: string, code: string, customer: string) {
  const [u] = await db.insert(users).values({ email, stripeCustomerId: customer }).returning();
  await attribute(u.id, code, NOW);
  return u;
}

const paid = (evt: string, invoice: string, customer: string, amount = 400) =>
  handleStripeEvent(event(evt, "invoice.paid", { id: invoice, customer, amount_paid: amount, status_transitions: { paid_at: Math.floor(NOW.getTime() / 1000) } }));

beforeAll(async () => {
  db = await testDb();
  h.db = db;
});

beforeEach(async () => {
  await truncateAll(db);
  await db.execute("truncate stripe_events");
  h.outbox.length = 0;
  invoicePaymentsByIntent.clear();
  process.env.APP_URL = "https://quietcourier.com";
  setStripeForTests(fake as unknown as Stripe);
});

afterEach(() => setStripeForTests(null));

describe("following a link", () => {
  it("counts clicks only for live links and keeps nothing about who clicked", async () => {
    await addReferrer("Alysia", "alysia");
    await addReferrer("Paused", "paused", { pausedAt: NOW });
    await addReferrer("Over", "over", { endsAt: new Date("2026-10-15T00:00:00Z") });
    expect(await followLink("alysia", "1.1.1.1", NOW)).toBe("alysia");
    expect(await followLink("alysia", "2.2.2.2", NOW)).toBe("alysia");
    expect(await followLink("nobody", "1.1.1.1", NOW)).toBeNull();
    expect(await followLink("paused", "1.1.1.1", NOW)).toBeNull();
    expect(await followLink("over", "1.1.1.1", NOW)).toBeNull();
    const clicks = await db.select().from(referralClicks);
    expect(clicks).toEqual([{ code: "alysia", day: "2026-11-03", count: 2 }]);
  });
});

describe("attribution", () => {
  it("carries the code on the sign-in link, so opening it on another device still counts", async () => {
    await addReferrer("Alysia", "alysia");
    await requestSignIn("reader@example.com", "1.1.1.1", "alysia");
    const [token] = await db.select().from(emailTokens);
    expect(token.referralCode).toBe("alysia");
    const result = await completeSignIn(linkToken(h.outbox[0].text), "9.9.9.9");
    expect(result && result !== "throttled" && result.user.referredBy).toBe("alysia");
  });

  it("never attributes an existing account, and the first code wins", async () => {
    await addReferrer("Alysia", "alysia");
    await addReferrer("Other", "other");
    await db.insert(users).values({ email: "old@example.com" });
    await requestSignIn("old@example.com", "1.1.1.1", "alysia");
    const result = await completeSignIn(linkToken(h.outbox[0].text), "1.1.1.1");
    expect(result && result !== "throttled" && result.user.referredBy).toBeNull();

    const [u] = await db.insert(users).values({ email: "new@example.com" }).returning();
    expect(await attribute(u.id, "alysia", NOW)).toBe(true);
    expect(await attribute(u.id, "other", NOW)).toBe(false);
    expect((await db.select().from(users).where(eq(users.id, u.id)))[0].referredBy).toBe("alysia");
  });

  it("ignores codes that are unknown, malformed or ended", async () => {
    await addReferrer("Over", "over", { endsAt: new Date("2026-10-15T00:00:00Z") });
    const [u] = await db.insert(users).values({ email: "a@example.com" }).returning();
    expect(await attribute(u.id, "over", NOW)).toBe(false);
    expect(await attribute(u.id, "../../x", NOW)).toBe(false);
    await requestSignIn("b@example.com", "1.1.1.1", "BAD CODE!");
    expect((await db.select().from(emailTokens))[0].referralCode).toBeNull();
  });
});

describe("paying readers", () => {
  it("counts only the first paid invoice, once, even if Stripe sends the event again", async () => {
    await addReferrer("Alysia", "alysia");
    await referredReader("r@example.com", "alysia", "cus_r");
    await paid("evt_0", "in_trial", "cus_r", 0);
    await paid("evt_1", "in_1", "cus_r");
    await paid("evt_1", "in_1", "cus_r");
    await paid("evt_2", "in_2", "cus_r");
    const rows = await db.select().from(referralConversions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ stripeInvoiceId: "in_1", payoutCents: 300, amountCents: 400 });
  });

  it("ignores readers nobody referred", async () => {
    await db.insert(users).values({ email: "plain@example.com", stripeCustomerId: "cus_p" });
    await paid("evt_1", "in_1", "cus_p");
    expect(await db.select().from(referralConversions)).toHaveLength(0);
  });

  it("stops at the cap, and a new rate applies only from then on", async () => {
    const r = await addReferrer("Capped", "capped", { maxPayouts: 2 });
    await referredReader("a@example.com", "capped", "cus_a");
    await referredReader("b@example.com", "capped", "cus_b");
    await referredReader("c@example.com", "capped", "cus_c");
    await paid("evt_a", "in_a", "cus_a");
    await db.update(referrers).set({ payoutCents: 200 }).where(eq(referrers.id, r.id));
    await paid("evt_b", "in_b", "cus_b");
    await paid("evt_c", "in_c", "cus_c");
    const rows = await db.select().from(referralConversions).orderBy(referralConversions.id);
    expect(rows.map((x) => x.payoutCents)).toEqual([300, 200]);
  });

  it("takes the payout back on a full refund, and owed never drops below zero", async () => {
    const r = await addReferrer("Alysia", "alysia");
    await referredReader("a@example.com", "alysia", "cus_a");
    await paid("evt_a", "in_a", "cus_a");
    await db.insert(referralPayouts).values({ referrerId: r.id, amountCents: 300, paidOn: "2026-11-05", method: "Zelle" });

    invoicePaymentsByIntent.set("pi_a", "in_a");
    await handleStripeEvent(event("evt_partial", "charge.refunded", { payment_intent: "pi_a", refunded: false }));
    expect((await db.select().from(referralConversions))[0].voidedAt).toBeNull();
    await handleStripeEvent(event("evt_full", "charge.refunded", { payment_intent: "pi_a", refunded: true }));
    expect((await db.select().from(referralConversions))[0].voidedAt).toBeInstanceOf(Date);

    const [f] = await referrerFigures(NOW);
    expect(f).toMatchObject({ paying: 0, voided: 1, earnedCents: 0, paidOutCents: 300, owedCents: 0 });
    expect(await db.select().from(stripeEvents)).toHaveLength(3);
  });

  it("keeps two referrers' figures apart", async () => {
    await addReferrer("Alysia", "alysia");
    await addReferrer("Cougar", "cougar", { kind: "organization", payoutCents: 250 });
    await referredReader("a@example.com", "alysia", "cus_a");
    await referredReader("b@example.com", "cougar", "cus_b");
    await referredReader("c@example.com", "cougar", "cus_c");
    await paid("evt_b", "in_b", "cus_b");
    await paid("evt_c", "in_c", "cus_c");
    const figures = Object.fromEntries((await referrerFigures(NOW)).map((f) => [f.referrer.name, f]));
    expect(figures.Alysia).toMatchObject({ signups: 1, paying: 0, earnedCents: 0 });
    expect(figures.Cougar).toMatchObject({ signups: 2, paying: 2, earnedCents: 500, owedCents: 500 });
  });
});

describe("statements", () => {
  it("adds up per month and for the year's accounts", async () => {
    const r = await addReferrer("Alysia", "alysia");
    await followLink("alysia", "1.1.1.1", NOW);
    await referredReader("a@example.com", "alysia", "cus_a");
    await paid("evt_a", "in_a", "cus_a");
    await db.insert(referralPayouts).values({ referrerId: r.id, amountCents: 300, paidOn: "2026-11-05", method: "Zelle" });

    const months = await monthlyFigures(r.id);
    expect(months).toEqual([
      { month: "2026-11", clicks: 1, signups: 1, paying: 1, voided: 0, earnedCents: 300, voidedCents: 0, paidOutCents: 300 },
    ]);
    const [f] = await referrerFigures(NOW);
    const statement = statementCsv("Alysia", "2026-11", months, f);
    expect(statement).toContain("New paying readers,1");
    expect(statement).toContain("Owed now (USD),0.00");
    expect(statement).not.toContain("@");

    const yearly = await accountingCsv(2026);
    expect(yearly).toContain("2026-11-05,Alysia,individual,no,3.00,Zelle,");
    expect(yearly).toContain("Total,,,,3.00");
  });
});
