import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, deliveries, partnerCopies, partnerReports, users } from "@/db/schema";
import { FORMAT_IDS as FORMATS } from "@/lib/formats";
import { at, billingEnabled } from "./billing";
import { editionFilename, editionsDir } from "./editions";
import { currentUser } from "./session";

export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(user: { email: string } | null) {
  return user != null && adminEmails().includes(user.email.toLowerCase());
}

// A 404 rather than a redirect, so the page looks the same as any missing page to everyone else.
export async function requireAdmin() {
  const user = await currentUser();
  if (!isAdmin(user)) notFound();
  return user!;
}

const count = (where: ReturnType<typeof sql>) => sql<number>`count(*) filter (where ${where})`.mapWith(Number);

// Mirrors SUBSCRIBERS in pipeline/courier/delivery.py, which decides who is actually sent a paper.
const receivingBase = sql`${users.deliveryStatus} = 'active'
  and (${users.deliveryMethod} = 'download' or (${users.deliveryEmail} is not null and ${users.deliveryEmailVerifiedAt} is not null))
  and ${users.termsAcceptedAt} is not null
  and ${users.timeZone} is not null and ${users.format} is not null
  and (not ${users.localWeather} or ${users.placeId} is not null)`;
// Mirrors ENTITLED in delivery.py; only applies once billing is on.
const entitled = (now: Date) =>
  sql`(${users.trialEndsAt} is null or ${users.trialEndsAt} > ${at(now)}
    or ${users.subscriptionStatus} in ('trialing', 'active', 'past_due'))`;
const onboarded = sql`${users.termsAcceptedAt} is not null and ${users.timeZone} is not null`;

export async function readerCounts(now = new Date()) {
  const receiving = billingEnabled() ? sql`${receivingBase} and ${entitled(now)}` : receivingBase;
  const [row] = await db
    .select({
      accounts: sql<number>`count(*)`.mapWith(Number),
      onboarded: count(onboarded),
      receiving: count(receiving),
      paused: count(sql`${onboarded} and ${users.deliveryStatus} = 'paused'`),
      unconfirmed: count(sql`${onboarded} and ${users.deliveryMethod} = 'email' and ${users.deliveryEmailVerifiedAt} is null`),
      byLink: count(sql`${receiving} and ${users.deliveryMethod} = 'download'`),
      small: count(sql`${receiving} and ${users.format} = 'small'`),
      large: count(sql`${receiving} and ${users.format} = 'large'`),
      epub: count(sql`${receiving} and ${users.format} = 'epub'`),
      general: count(sql`${receiving} and not ${users.localWeather}`),
    })
    .from(users);
  return row;
}

export async function activity(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000);
  const events = await db
    .select({ event: auditEvents.event, n: sql<number>`count(*)`.mapWith(Number) })
    .from(auditEvents)
    .where(gte(auditEvents.createdAt, since))
    .groupBy(auditEvents.event);
  const of = (e: string) => events.find((r) => r.event === e)?.n ?? 0;
  const sinceDate = since.toISOString().slice(0, 10);
  const [sends] = await db
    .select({
      sent: count(sql`${deliveries.status} = 'sent'`),
      failed: count(sql`${deliveries.status} = 'failed'`),
    })
    .from(deliveries)
    .where(gte(deliveries.editionDate, sinceDate));
  const finished = sends.sent + sends.failed;
  const [checkIns] = await db
    .select({
      asked: count(sql`${users.checkInSentAt} >= ${at(since)}`),
      yes: count(sql`${users.checkInAnsweredAt} >= ${at(since)} and ${users.checkInAnswer} = 'yes'`),
      no: count(sql`${users.checkInAnsweredAt} >= ${at(since)} and ${users.checkInAnswer} = 'no'`),
    })
    .from(users);
  const [backups] = await db
    .select({ sent: count(sql`${deliveries.backupSentAt} >= ${at(since)}`) })
    .from(deliveries);
  return {
    signups: of("account_created"),
    setupsFinished: of("terms_accepted"),
    paused: of("delivery_paused"),
    resumed: of("delivery_resumed"),
    deleted: of("account_deleted"),
    signInsThrottled: of("sign_in_throttled"),
    linksRejected: of("sign_in_link_rejected"),
    downloads: of("edition_downloaded"),
    sent: sends.sent,
    failed: sends.failed,
    successRate: finished ? sends.sent / finished : null,
    checkInsAsked: checkIns.asked,
    checkInsYes: checkIns.yes,
    checkInsNo: checkIns.no,
    backupLinks: backups.sent,
  };
}

export async function deliveriesByDay(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return db
    .select({
      date: deliveries.editionDate,
      sent: count(sql`${deliveries.status} = 'sent'`),
      pending: count(sql`${deliveries.status} = 'pending'`),
      failed: count(sql`${deliveries.status} = 'failed'`),
    })
    .from(deliveries)
    .where(gte(deliveries.editionDate, since))
    .groupBy(deliveries.editionDate)
    .orderBy(desc(deliveries.editionDate));
}

export async function failedDeliveries(limit = 50) {
  return db
    .select({
      id: deliveries.id,
      date: deliveries.editionDate,
      editionKey: deliveries.editionKey,
      format: deliveries.format,
      attempts: deliveries.attempts,
      error: deliveries.error,
      updatedAt: deliveries.updatedAt,
      email: users.email,
      deliveryEmail: users.deliveryEmail,
    })
    .from(deliveries)
    .innerJoin(users, eq(users.id, deliveries.userId))
    .where(eq(deliveries.status, "failed"))
    .orderBy(desc(deliveries.editionDate), desc(deliveries.updatedAt))
    .limit(limit);
}

export async function partnerHistory(limit = 10) {
  const copies = await db.select().from(partnerCopies).orderBy(desc(partnerCopies.editionDate)).limit(limit);
  const reports = await db.select().from(partnerReports).orderBy(desc(partnerReports.month)).limit(limit);
  return { copies, reports };
}

export async function recentSignups(limit = 10) {
  return db
    .select({ email: users.email, createdAt: users.createdAt, onboarded: sql<boolean>`${onboarded}` })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(limit);
}

export const EDITION_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const EDITION_KEY = /^(general|gn-\d+|[a-z-]+)$/;

export type BuiltEdition = { date: string; key: string; files: { name: string; bytes: number }[] };

export async function recentEditions(maxDates = 3): Promise<BuiltEdition[]> {
  const root = editionsDir();
  let dates: string[];
  try {
    dates = (await readdir(root)).filter((d) => EDITION_DATE.test(d)).sort().reverse().slice(0, maxDates);
  } catch {
    return [];
  }
  const out: BuiltEdition[] = [];
  for (const date of dates) {
    const keys = (await readdir(path.join(root, date)).catch(() => [] as string[])).filter((k) => EDITION_KEY.test(k)).sort();
    for (const key of keys) {
      const dir = path.join(root, date, key);
      const files = [];
      for (const name of FORMATS.map((f) => editionFilename(key, f))) {
        const info = await stat(path.join(dir, name)).catch(() => null);
        if (info?.isFile()) files.push({ name, bytes: info.size });
      }
      if (files.length) out.push({ date, key, files });
    }
  }
  return out;
}

// Both parts are checked before they touch the disk, and the file name is rebuilt rather than taken from the request.
export function editionPath(date: string, key: string, file: string) {
  if (!EDITION_DATE.test(date) || !EDITION_KEY.test(key)) return null;
  const format = FORMATS.find((f) => editionFilename(key, f) === file);
  return format ? path.join(editionsDir(), date, key, editionFilename(key, format)) : null;
}
