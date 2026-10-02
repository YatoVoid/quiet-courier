import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { seedPlaces, testDb, truncateAll, type TestDb } from "@/test/db";
import { stripeEvents, users, type User } from "@/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown, outbox: [] as { to: string; subject: string; text: string }[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: new Proxy({}, { get: (_t, p) => Reflect.get(h.db as object, p) }) }));
vi.mock("./mail", () => ({ sendMail: async (m: (typeof h.outbox)[number]) => void h.outbox.push(m) }));

import { cancelForDeletion, handleStripeEvent, planFor, setStripeForTests, startCheckout, trialEndFor, verifyStripeEvent } from "./billing";

const NOW = new Date("2026-11-01T12:00:00Z");
const DAY = 86_400_000;
let db: TestDb;
let user: User;

type FakeSub = { id: string; customer: string; status: string; cancel_at_period_end: boolean; cancel_at: number | null; trial_end: number | null; items: { data: { current_period_end: number }[] } };
const subs = new Map<string, FakeSub>();
const calls = { checkout: [] as Record<string, unknown>[], cancelled: [] as string[], customers: 0 };

const fake = {
  customers: { create: async () => ({ id: `cus_${++calls.customers}` }) },
  checkout: {
    sessions: {
      create: async (params: Record<string, unknown>) => {
        calls.checkout.push(params);
        return { url: "https://checkout.stripe.com/c/pay/test" };
      },
    },
  },
  subscriptions: {
    retrieve: async (id: string) => subs.get(id),
    cancel: async (id: string) => void calls.cancelled.push(id),
  },
  billingPortal: { sessions: { create: async () => ({ url: "https://billing.stripe.com/p/test" }) } },
};

const sub = (id: string, status: string, extra: Partial<FakeSub> = {}): FakeSub => ({
  id, customer: "cus_1", status, cancel_at_period_end: false, cancel_at: null, trial_end: null,
  items: { data: [{ current_period_end: Math.floor((NOW.getTime() + 30 * DAY) / 1000) }] }, ...extra,
});
const event = (id: string, type: string, object: unknown) => ({ id, type, data: { object } }) as unknown as Stripe.Event;
const fresh = async () => (await db.select().from(users).where(eq(users.id, user.id)))[0];

beforeAll(async () => {
  db = await testDb();
  h.db = db;
  await seedPlaces(db);
});

beforeEach(async () => {
  await truncateAll(db);
  await db.execute("truncate stripe_events");
  process.env.BILLING_ENABLED = "1";
  process.env.STRIPE_PRICE_ID = "price_server_side";
  process.env.APP_URL = "https://quietcourier.com";
  h.outbox.length = 0;
  subs.clear();
  calls.checkout.length = 0;
  calls.cancelled.length = 0;
  calls.customers = 0;
  setStripeForTests(fake as unknown as Stripe);
  [user] = await db
    .insert(users)
    .values({ email: "ada@example.com", timeZone: "America/Chicago", termsAcceptedAt: NOW, termsVersion: "1" })
    .returning();
});

afterEach(() => setStripeForTests(null));

describe("planFor", () => {
  const base = { trialEndsAt: null, subscriptionStatus: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };

  it("follows the trial, then the subscription", () => {
    expect(planFor(base, NOW).kind).toBe("waiting");
    expect(planFor({ ...base, trialEndsAt: new Date(NOW.getTime() + DAY) }, NOW).kind).toBe("trial");
    expect(planFor({ ...base, trialEndsAt: new Date(NOW.getTime() - 1) }, NOW).kind).toBe("ended");
    expect(planFor({ ...base, trialEndsAt: new Date(NOW.getTime() - 1), subscriptionStatus: "past_due" }, NOW).kind).toBe("subscribed");
    expect(planFor({ ...base, trialEndsAt: new Date(NOW.getTime() - 1), subscriptionStatus: "canceled" }, NOW).kind).toBe("ended");
  });

  it("is off until billing is enabled", () => {
    process.env.BILLING_ENABLED = "0";
    expect(planFor(base, NOW).kind).toBe("off");
  });
});

describe("trialEndFor", () => {
  it("keeps the reader's remaining free days, at least the two days Stripe needs", () => {
    expect(trialEndFor({ trialEndsAt: null }, NOW)).toEqual(new Date(NOW.getTime() + 14 * DAY));
    expect(trialEndFor({ trialEndsAt: new Date(NOW.getTime() + 5 * DAY) }, NOW)).toEqual(new Date(NOW.getTime() + 5 * DAY));
    expect(trialEndFor({ trialEndsAt: new Date(NOW.getTime() + DAY) }, NOW)!.getTime()).toBeGreaterThan(NOW.getTime() + 2 * DAY);
    expect(trialEndFor({ trialEndsAt: new Date(NOW.getTime() - DAY) }, NOW)).toBeNull();
  });
});

describe("startCheckout", () => {
  it("uses the server's price, keeps the free days and records consent", async () => {
    const { url } = await startCheckout(user, "203.0.113.5", NOW);
    expect(url).toBe("https://checkout.stripe.com/c/pay/test");
    const [params] = calls.checkout as { line_items: { price: string }[]; subscription_data: { trial_end: number }; client_reference_id: string }[];
    expect(params.line_items).toEqual([{ price: "price_server_side", quantity: 1 }]);
    expect(params.client_reference_id).toBe(user.id);
    expect(params.subscription_data.trial_end).toBe(Math.floor((NOW.getTime() + 14 * DAY) / 1000));
    const after = await fresh();
    expect(after.stripeCustomerId).toBe("cus_1");
    expect(after.billingConsentAt).toEqual(NOW);
    expect(after.trialEndsAt).toEqual(new Date(NOW.getTime() + 14 * DAY));
  });

  it("charges right away once the trial is over", async () => {
    await db.update(users).set({ trialEndsAt: new Date(NOW.getTime() - DAY) }).where(eq(users.id, user.id));
    await startCheckout(await fresh(), "203.0.113.5", NOW);
    expect((calls.checkout[0] as { subscription_data: Record<string, unknown> }).subscription_data).not.toHaveProperty("trial_end");
  });

  it("sends a current subscriber back to their account instead of a second checkout", async () => {
    await db.update(users).set({ subscriptionStatus: "active" }).where(eq(users.id, user.id));
    expect((await startCheckout(await fresh(), "203.0.113.5", NOW)).url).toBe("https://quietcourier.com/account");
    expect(calls.checkout).toHaveLength(0);
  });
});

describe("handleStripeEvent", () => {
  const completed = (id = "evt_1") =>
    event(id, "checkout.session.completed", { client_reference_id: user.id, customer: "cus_1", subscription: "sub_1" });

  it("links the subscription after checkout and confirms it by email, once", async () => {
    subs.set("sub_1", sub("sub_1", "trialing", { trial_end: Math.floor((NOW.getTime() + 14 * DAY) / 1000) }));
    await handleStripeEvent(completed());
    await handleStripeEvent(completed());
    const after = await fresh();
    expect(after).toMatchObject({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", subscriptionStatus: "trialing" });
    expect(after.currentPeriodEnd).toEqual(new Date(Math.floor((NOW.getTime() + 30 * DAY) / 1000) * 1000));
    expect(h.outbox).toHaveLength(1);
    expect(h.outbox[0].text).toContain("renews automatically every month at $4 until you cancel");
    expect(h.outbox[0].text).toContain("November 15, 2026");
    expect(await db.select().from(stripeEvents)).toHaveLength(1);
  });

  it("reads the latest state from Stripe whatever order events arrive in", async () => {
    await db.update(users).set({ stripeCustomerId: "cus_1" }).where(eq(users.id, user.id));
    subs.set("sub_1", sub("sub_1", "active", { cancel_at_period_end: true }));
    await handleStripeEvent(event("evt_2", "customer.subscription.created", { id: "sub_1" }));
    expect(await fresh()).toMatchObject({ subscriptionStatus: "active", cancelAtPeriodEnd: true });
  });

  it("doesn't let an old ended subscription overwrite a newer one", async () => {
    await db.update(users).set({ stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_new", subscriptionStatus: "active" }).where(eq(users.id, user.id));
    subs.set("sub_old", sub("sub_old", "canceled"));
    await handleStripeEvent(event("evt_3", "customer.subscription.deleted", { id: "sub_old" }));
    expect(await fresh()).toMatchObject({ stripeSubscriptionId: "sub_new", subscriptionStatus: "active" });
  });

  it("ignores a checkout that names a different customer than the account has", async () => {
    await db.update(users).set({ stripeCustomerId: "cus_other" }).where(eq(users.id, user.id));
    subs.set("sub_1", sub("sub_1", "active"));
    await handleStripeEvent(completed("evt_4"));
    expect(await fresh()).toMatchObject({ stripeCustomerId: "cus_other", subscriptionStatus: null });
  });

  it("skips a status Stripe adds later instead of failing every retry", async () => {
    await db.update(users).set({ stripeCustomerId: "cus_1" }).where(eq(users.id, user.id));
    subs.set("sub_1", sub("sub_1", "some_new_status"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await handleStripeEvent(event("evt_5", "customer.subscription.updated", { id: "sub_1" }));
    expect((await fresh()).subscriptionStatus).toBeNull();
  });
});

describe("verifyStripeEvent", () => {
  it("accepts only bodies signed with the webhook secret", () => {
    setStripeForTests(new Stripe("sk_test_dummy"));
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const body = JSON.stringify({ id: "evt_9", object: "event", type: "invoice.paid", data: { object: {} } });
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test" });
    expect(verifyStripeEvent(body, header)?.id).toBe("evt_9");
    expect(verifyStripeEvent(body.replace("evt_9", "evt_0"), header)).toBeNull();
    expect(verifyStripeEvent(body, null)).toBeNull();
    const forged = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_wrong" });
    expect(verifyStripeEvent(body, forged)).toBeNull();
  });
});

describe("cancelForDeletion", () => {
  it("cancels a live subscription and leaves ended ones alone", async () => {
    await cancelForDeletion({ stripeSubscriptionId: "sub_1", subscriptionStatus: "active" });
    await cancelForDeletion({ stripeSubscriptionId: "sub_2", subscriptionStatus: "canceled" });
    await cancelForDeletion({ stripeSubscriptionId: null, subscriptionStatus: null });
    expect(calls.cancelled).toEqual(["sub_1"]);
  });
});
