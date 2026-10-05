import "server-only";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { referralClicks, referralConversions, referralLinks, referralPayouts, referrers, users, type Referrer } from "@/db/schema";
import { isLimited, LIMITS, record } from "./rate-limit";

export const REF_COOKIE = "qc_ref";
export const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CODE = /^[a-z0-9-]{2,32}$/;
// Individuals paid this much in a year need a W-9 on file and a 1099-NEC.
export const FORM_1099_CENTS = 60_000;

type Db = typeof db;
const at = (d: Date) => sql`${d.toISOString()}::timestamptz`;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function referrerStatus(r: Pick<Referrer, "pausedAt" | "startsAt" | "endsAt">, now = new Date()) {
  if (r.endsAt && r.endsAt <= now) return "ended" as const;
  if (r.pausedAt) return "paused" as const;
  if (r.startsAt > now) return "not started" as const;
  return "active" as const;
}

async function activeLink(code: string | null | undefined, now: Date) {
  if (!code || !CODE.test(code)) return null;
  const [row] = await db
    .select({ code: referralLinks.code, disabledAt: referralLinks.disabledAt, referrer: referrers })
    .from(referralLinks)
    .innerJoin(referrers, eq(referrers.id, referralLinks.referrerId))
    .where(eq(referralLinks.code, code));
  if (!row || row.disabledAt || referrerStatus(row.referrer, now) !== "active") return null;
  return row;
}

// Counts the click and returns the code to store in the cookie, or null when the link
// shouldn't attribute anyone. The visitor is sent to the home page either way.
export async function followLink(code: string, ip: string, now = new Date()) {
  const key = `via:ip:${ip}`;
  if (await isLimited(key, LIMITS.viaPerIp, now)) return null;
  await record(key, now);
  const link = await activeLink(code, now);
  if (!link) return null;
  await db
    .insert(referralClicks)
    .values({ code: link.code, day: now.toISOString().slice(0, 10), count: 1 })
    .onConflictDoUpdate({ target: [referralClicks.code, referralClicks.day], set: { count: sql`${referralClicks.count} + 1` } });
  return link.code;
}

// Only new accounts are attributed, and the first code wins.
export async function attribute(userId: string, code: string | null | undefined, now = new Date()) {
  const link = await activeLink(code, now);
  if (!link) return false;
  const updated = await db
    .update(users)
    .set({ referredBy: link.code, referredAt: now })
    .where(and(eq(users.id, userId), isNull(users.referredBy)))
    .returning({ id: users.id });
  return updated.length > 0;
}

// Called inside the Stripe webhook transaction for every paid invoice. Only a referred reader's
// first invoice with money in it counts, and the referrer's cap is checked at that moment.
export async function recordConversion(
  tx: Tx,
  user: { id: string; referredBy: string | null },
  invoice: { id: string; amountPaid: number; paidAt: Date },
) {
  if (!user.referredBy || invoice.amountPaid <= 0) return false;
  const [link] = await tx
    .select({ code: referralLinks.code, referrer: referrers })
    .from(referralLinks)
    .innerJoin(referrers, eq(referrers.id, referralLinks.referrerId))
    .where(eq(referralLinks.code, user.referredBy));
  if (!link) return false;
  if (link.referrer.maxPayouts != null) {
    const [{ n }] = await tx
      .select({ n: count() })
      .from(referralConversions)
      .where(and(eq(referralConversions.referrerId, link.referrer.id), isNull(referralConversions.voidedAt)));
    if (n >= link.referrer.maxPayouts) return false;
  }
  const inserted = await tx
    .insert(referralConversions)
    .values({
      userId: user.id,
      code: link.code,
      referrerId: link.referrer.id,
      stripeInvoiceId: invoice.id,
      amountCents: invoice.amountPaid,
      payoutCents: link.referrer.payoutCents,
      paidAt: invoice.paidAt,
    })
    .onConflictDoNothing()
    .returning({ id: referralConversions.id });
  return inserted.length > 0;
}

export async function voidConversion(tx: Tx, invoiceId: string, now = new Date()) {
  const updated = await tx
    .update(referralConversions)
    .set({ voidedAt: now })
    .where(and(eq(referralConversions.stripeInvoiceId, invoiceId), isNull(referralConversions.voidedAt)))
    .returning({ id: referralConversions.id });
  return updated.length > 0;
}

export type ReferrerFigures = {
  links: number;
  clicks: number;
  signups: number;
  finishedSetup: number;
  paying: number;
  voided: number;
  earnedCents: number;
  paidOutCents: number;
  owedCents: number;
};

const n = (q: ReturnType<typeof sql>) => sql<number>`coalesce((${q}), 0)`.mapWith(Number);

// Owed never goes below zero: a refund after payout simply leaves less owed next month.
export async function referrerFigures(now = new Date()) {
  const rows = await db
    .select({
      referrer: referrers,
      links: n(sql`select count(*) from referral_links l where l.referrer_id = ${referrers.id}`),
      clicks: n(sql`select sum(c.count) from referral_clicks c join referral_links l on l.code = c.code where l.referrer_id = ${referrers.id}`),
      signups: n(sql`select count(*) from users u join referral_links l on l.code = u.referred_by where l.referrer_id = ${referrers.id}`),
      finishedSetup: n(sql`select count(*) from users u join referral_links l on l.code = u.referred_by where l.referrer_id = ${referrers.id} and u.terms_accepted_at is not null`),
      paying: n(sql`select count(*) from referral_conversions v where v.referrer_id = ${referrers.id} and v.voided_at is null`),
      voided: n(sql`select count(*) from referral_conversions v where v.referrer_id = ${referrers.id} and v.voided_at is not null`),
      earnedCents: n(sql`select sum(v.payout_cents) from referral_conversions v where v.referrer_id = ${referrers.id} and v.voided_at is null`),
      paidOutCents: n(sql`select sum(p.amount_cents) from referral_payouts p where p.referrer_id = ${referrers.id}`),
      paidThisYearCents: n(sql`select sum(p.amount_cents) from referral_payouts p where p.referrer_id = ${referrers.id} and extract(year from p.paid_on) = extract(year from ${at(now)})`),
    })
    .from(referrers)
    .orderBy(referrers.createdAt);
  return rows.map((r) => ({ ...r, owedCents: Math.max(0, r.earnedCents - r.paidOutCents), status: referrerStatus(r.referrer, now) }));
}

export type MonthRow = {
  month: string;
  clicks: number;
  signups: number;
  paying: number;
  voided: number;
  earnedCents: number;
  voidedCents: number;
  paidOutCents: number;
};

export async function monthlyFigures(referrerId: number): Promise<MonthRow[]> {
  const result = await db.execute(sql`
    with months as (
      select to_char(c.day, 'YYYY-MM') as m from referral_clicks c join referral_links l on l.code = c.code where l.referrer_id = ${referrerId}
      union select to_char(u.referred_at at time zone 'UTC', 'YYYY-MM') from users u join referral_links l on l.code = u.referred_by where l.referrer_id = ${referrerId}
      union select to_char(v.paid_at at time zone 'UTC', 'YYYY-MM') from referral_conversions v where v.referrer_id = ${referrerId}
      union select to_char(v.voided_at at time zone 'UTC', 'YYYY-MM') from referral_conversions v where v.referrer_id = ${referrerId} and v.voided_at is not null
      union select to_char(p.paid_on, 'YYYY-MM') from referral_payouts p where p.referrer_id = ${referrerId}
    )
    select m as month,
      coalesce((select sum(c.count) from referral_clicks c join referral_links l on l.code = c.code where l.referrer_id = ${referrerId} and to_char(c.day, 'YYYY-MM') = m), 0) as clicks,
      (select count(*) from users u join referral_links l on l.code = u.referred_by where l.referrer_id = ${referrerId} and to_char(u.referred_at at time zone 'UTC', 'YYYY-MM') = m) as signups,
      (select count(*) from referral_conversions v where v.referrer_id = ${referrerId} and to_char(v.paid_at at time zone 'UTC', 'YYYY-MM') = m) as paying,
      (select count(*) from referral_conversions v where v.referrer_id = ${referrerId} and v.voided_at is not null and to_char(v.voided_at at time zone 'UTC', 'YYYY-MM') = m) as voided,
      coalesce((select sum(v.payout_cents) from referral_conversions v where v.referrer_id = ${referrerId} and to_char(v.paid_at at time zone 'UTC', 'YYYY-MM') = m), 0) as earned_cents,
      coalesce((select sum(v.payout_cents) from referral_conversions v where v.referrer_id = ${referrerId} and v.voided_at is not null and to_char(v.voided_at at time zone 'UTC', 'YYYY-MM') = m), 0) as voided_cents,
      coalesce((select sum(p.amount_cents) from referral_payouts p where p.referrer_id = ${referrerId} and to_char(p.paid_on, 'YYYY-MM') = m), 0) as paid_out_cents
    from months where m is not null order by m desc`);
  const rows = (Array.isArray(result) ? result : (result as { rows: Record<string, unknown>[] }).rows) as Record<string, unknown>[];
  return rows.map((r) => ({
    month: String(r.month),
    clicks: Number(r.clicks),
    signups: Number(r.signups),
    paying: Number(r.paying),
    voided: Number(r.voided),
    earnedCents: Number(r.earned_cents),
    voidedCents: Number(r.voided_cents),
    paidOutCents: Number(r.paid_out_cents),
  }));
}

export async function referrerLinks(referrerId: number) {
  return db
    .select({
      code: referralLinks.code,
      label: referralLinks.label,
      disabledAt: referralLinks.disabledAt,
      clicks: n(sql`select sum(c.count) from referral_clicks c where c.code = ${referralLinks.code}`),
      signups: n(sql`select count(*) from users u where u.referred_by = ${referralLinks.code}`),
      paying: n(sql`select count(*) from referral_conversions v where v.code = ${referralLinks.code} and v.voided_at is null`),
    })
    .from(referralLinks)
    .where(eq(referralLinks.referrerId, referrerId))
    .orderBy(referralLinks.createdAt);
}

export async function referrerPayouts(referrerId: number) {
  return db.select().from(referralPayouts).where(eq(referralPayouts.referrerId, referrerId)).orderBy(sql`${referralPayouts.paidOn} desc`);
}

const dollars = (cents: number) => (cents / 100).toFixed(2);
const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

// Dates and counts only, so it can be sent to the referrer as it is.
export function statementCsv(name: string, month: string, rows: MonthRow[], figures: ReferrerFigures) {
  const m = rows.find((r) => r.month === month) ?? { clicks: 0, signups: 0, paying: 0, voided: 0, earnedCents: 0, voidedCents: 0, paidOutCents: 0 };
  return csv([
    ["The Quiet Courier referral statement"],
    ["Referrer", name],
    ["Month", month],
    [],
    ["Link clicks", m.clicks],
    ["Sign-ups", m.signups],
    ["New paying readers", m.paying],
    ["Refunded (voided)", m.voided],
    ["Earned this month (USD)", dollars(m.earnedCents - m.voidedCents)],
    ["Paid this month (USD)", dollars(m.paidOutCents)],
    [],
    ["Earned to date (USD)", dollars(figures.earnedCents)],
    ["Paid to date (USD)", dollars(figures.paidOutCents)],
    ["Owed now (USD)", dollars(figures.owedCents)],
  ]);
}

export async function accountingCsv(year: number) {
  const rows = await db
    .select({ payout: referralPayouts, name: referrers.name, kind: referrers.kind, w9: referrers.w9OnFile })
    .from(referralPayouts)
    .innerJoin(referrers, eq(referrers.id, referralPayouts.referrerId))
    .where(sql`extract(year from ${referralPayouts.paidOn}) = ${year}`)
    .orderBy(referralPayouts.paidOn);
  const total = rows.reduce((s, r) => s + r.payout.amountCents, 0);
  return csv([
    ["Date", "Referrer", "Kind", "W-9 on file", "Amount (USD)", "Method", "Note"],
    ...rows.map((r) => [r.payout.paidOn, r.name, r.kind, r.w9 ? "yes" : "no", dollars(r.payout.amountCents), r.payout.method, r.payout.note ?? ""]),
    [],
    ["Total", "", "", "", dollars(total), "", ""],
  ]);
}
