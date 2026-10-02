import "server-only";
import Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { SUBSCRIPTION_STATUSES, stripeEvents, users, type User } from "@/db/schema";
import { TERMS_VERSION, TRIAL_DAYS } from "@/lib/site";
import { appUrl } from "./config";
import { audit } from "./audit";
import { sendSubscriptionConfirmation } from "./billing-mail";

const DAY_MS = 86_400_000;
// Stripe refuses a trial that ends less than 48 hours after the subscription starts.
const MIN_TRIAL_MS = 2 * DAY_MS + 60 * 60 * 1000;
const CURRENT = ["trialing", "active", "past_due"] as const;

export function billingEnabled() {
  return process.env.BILLING_ENABLED === "1";
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

let client: Stripe | null = null;
export function stripe() {
  client ??= new Stripe(required("STRIPE_SECRET_KEY"), { timeout: 15_000, maxNetworkRetries: 2 });
  return client;
}

export function setStripeForTests(s: Stripe | null) {
  client = s;
}

export type Plan =
  | { kind: "off" }
  | { kind: "waiting" }
  | { kind: "trial"; ends: Date }
  | { kind: "subscribed"; status: (typeof CURRENT)[number]; renews: Date | null; ending: boolean }
  | { kind: "ended" };

type BillingFields = Pick<User, "trialEndsAt" | "subscriptionStatus" | "currentPeriodEnd" | "cancelAtPeriodEnd">;

// Mirrors ENTITLED in pipeline/courier/delivery.py, which decides who is sent a paper.
export function planFor(user: BillingFields, now = new Date()): Plan {
  if (!billingEnabled()) return { kind: "off" };
  const status = user.subscriptionStatus;
  if (status && (CURRENT as readonly string[]).includes(status)) {
    return { kind: "subscribed", status: status as (typeof CURRENT)[number], renews: user.currentPeriodEnd, ending: user.cancelAtPeriodEnd };
  }
  if (!user.trialEndsAt) return { kind: "waiting" };
  if (user.trialEndsAt > now) return { kind: "trial", ends: user.trialEndsAt };
  return { kind: "ended" };
}

export function canSubscribe(plan: Plan) {
  return plan.kind === "waiting" || plan.kind === "trial" || plan.kind === "ended";
}

// A reader who subscribes keeps the rest of their free days: the first charge waits for the trial to end.
// Subscribing before the first paper starts the trial now.
export function trialEndFor(user: Pick<User, "trialEndsAt">, now = new Date()): Date | null {
  const ends = user.trialEndsAt ?? new Date(now.getTime() + TRIAL_DAYS * DAY_MS);
  if (ends.getTime() <= now.getTime()) return null;
  return new Date(Math.max(ends.getTime(), now.getTime() + MIN_TRIAL_MS));
}

async function customerFor(user: User) {
  if (user.stripeCustomerId) return user.stripeCustomerId;
  const customer = await stripe().customers.create(
    { email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } },
    { idempotencyKey: `customer-${user.id}` },
  );
  await db.update(users).set({ stripeCustomerId: customer.id }).where(eq(users.id, user.id));
  return customer.id;
}

export async function startCheckout(user: User, ip: string, now = new Date()) {
  if (!billingEnabled()) throw new Error("billing is not enabled");
  if (!canSubscribe(planFor(user, now))) return { url: `${appUrl()}/account` };
  const customer = await customerFor(user);
  const trialEnd = trialEndFor(user, now);
  await db
    .update(users)
    .set({
      billingConsentVersion: TERMS_VERSION,
      billingConsentAt: now,
      ...(user.trialEndsAt == null && trialEnd ? { trialEndsAt: trialEnd } : {}),
    })
    .where(eq(users.id, user.id));
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    integration_identifier: "quiet-courier-subscribe-hkqwmzvr",
    customer,
    client_reference_id: user.id,
    line_items: [{ price: required("STRIPE_PRICE_ID"), quantity: 1 }],
    subscription_data: {
      metadata: { userId: user.id },
      ...(trialEnd ? { trial_end: Math.floor(trialEnd.getTime() / 1000) } : {}),
    },
    success_url: `${appUrl()}/account?notice=subscribed`,
    cancel_url: `${appUrl()}/subscribe`,
  });
  await audit("billing_checkout_started", { userId: user.id, ip, detail: { trialEnd: trialEnd?.toISOString() ?? null } });
  if (!session.url) throw new Error("Stripe returned a checkout session without a URL");
  return { url: session.url };
}

export async function portalUrl(user: User) {
  if (!user.stripeCustomerId) return null;
  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${appUrl()}/account`,
  });
  return session.url;
}

// Called before an account is deleted, so nobody is charged for a paper they can no longer get.
export async function cancelForDeletion(user: Pick<User, "stripeSubscriptionId" | "subscriptionStatus">) {
  if (!user.stripeSubscriptionId) return;
  if (user.subscriptionStatus === "canceled" || user.subscriptionStatus === "incomplete_expired") return;
  try {
    await stripe().subscriptions.cancel(user.stripeSubscriptionId);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing") return;
    throw err;
  }
}

function periodEnd(sub: Stripe.Subscription) {
  const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === "number");
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

const idOf = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null));

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AfterCommit = (() => Promise<void>)[];

// Always reads the subscription back from Stripe, so events arriving out of order can't leave stale state.
async function syncSubscription(tx: Tx, subscriptionId: string, after: AfterCommit) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const customer = idOf(sub.customer);
  if (!customer) return;
  const [user] = await tx.select().from(users).where(eq(users.stripeCustomerId, customer)).limit(1);
  if (!user) return;
  if (!(SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) {
    console.error("unknown Stripe subscription status", sub.id, sub.status);
    return;
  }
  const status = sub.status as (typeof SUBSCRIPTION_STATUSES)[number];
  // An old, ended subscription must not overwrite a newer one the reader started later.
  const isCurrent = (CURRENT as readonly string[]).includes(sub.status);
  if (user.stripeSubscriptionId && user.stripeSubscriptionId !== sub.id && !isCurrent) return;
  await tx
    .update(users)
    .set({
      stripeSubscriptionId: sub.id,
      subscriptionStatus: status,
      currentPeriodEnd: periodEnd(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end || sub.cancel_at != null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));
  if (user.subscriptionStatus !== sub.status) {
    const detail = { from: user.subscriptionStatus, to: sub.status };
    after.push(() => audit("billing_status_changed", { userId: user.id, detail }));
  }
  return { user, sub };
}

export async function handleStripeEvent(event: Stripe.Event) {
  const after: AfterCommit = [];
  // Recorded first and checked inside the same transaction, so a redelivered event is skipped
  // and a failed one rolls back and is retried by Stripe. Emails and audit rows wait for the commit.
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(stripeEvents)
      .values({ id: event.id, type: event.type })
      .onConflictDoNothing()
      .returning({ id: stripeEvents.id });
    if (!inserted.length) return;

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id;
        const customer = idOf(session.customer);
        const subscription = idOf(session.subscription);
        if (!userId || !customer || !subscription) return;
        const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user || (user.stripeCustomerId && user.stripeCustomerId !== customer)) return;
        await tx.update(users).set({ stripeCustomerId: customer }).where(eq(users.id, userId));
        const synced = await syncSubscription(tx, subscription, after);
        if (synced) after.push(() => sendSubscriptionConfirmation(synced.user, synced.sub));
        return;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed":
        await syncSubscription(tx, event.data.object.id, after);
        return;
      case "invoice.paid":
      case "invoice.payment_failed": {
        const parent = event.data.object.parent;
        const sub = parent?.subscription_details?.subscription;
        if (sub) await syncSubscription(tx, idOf(sub)!, after);
        return;
      }
    }
  });
  for (const run of after) {
    try {
      await run();
    } catch (err) {
      console.error("after Stripe event", event.id, err);
    }
  }
}

export function verifyStripeEvent(body: string, signature: string | null) {
  if (!signature) return null;
  try {
    return stripe().webhooks.constructEvent(body, signature, required("STRIPE_WEBHOOK_SECRET"));
  } catch (err) {
    if (err instanceof Stripe.errors.StripeSignatureVerificationError) return null;
    throw err;
  }
}

export async function subscriberCounts(now = new Date()) {
  const [row] = await db
    .select({
      paying: sql<number>`count(*) filter (where ${users.subscriptionStatus} = 'active')`.mapWith(Number),
      subscribedInTrial: sql<number>`count(*) filter (where ${users.subscriptionStatus} = 'trialing')`.mapWith(Number),
      pastDue: sql<number>`count(*) filter (where ${users.subscriptionStatus} = 'past_due')`.mapWith(Number),
      cancelling: sql<number>`count(*) filter (where ${users.cancelAtPeriodEnd} and ${users.subscriptionStatus} in ('active', 'trialing'))`.mapWith(Number),
      inFreeTrial: sql<number>`count(*) filter (where ${users.trialEndsAt} > ${now} and (${users.subscriptionStatus} is null or ${users.subscriptionStatus} not in ('trialing', 'active', 'past_due')))`.mapWith(Number),
      trialEnded: sql<number>`count(*) filter (where ${users.trialEndsAt} <= ${now} and (${users.subscriptionStatus} is null or ${users.subscriptionStatus} not in ('trialing', 'active', 'past_due')))`.mapWith(Number),
    })
    .from(users);
  return row;
}
