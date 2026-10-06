import "server-only";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { rateEvents } from "@/db/schema";

export const LIMITS = {
  signInPerEmail: { max: 5, windowMs: 60 * 60 * 1000 },
  signInPerIp: { max: 20, windowMs: 60 * 60 * 1000 },
  redeemPerIp: { max: 30, windowMs: 15 * 60 * 1000 },
  testEditionPerUser: { max: 3, windowMs: 24 * 60 * 60 * 1000 },
  verifyDeliveryPerUser: { max: 5, windowMs: 24 * 60 * 60 * 1000 },
  checkoutPerUser: { max: 10, windowMs: 60 * 60 * 1000 },
  readFailuresPerIp: { max: 20, windowMs: 60 * 60 * 1000 },
  readsPerUser: { max: 120, windowMs: 60 * 60 * 1000 },
  viaPerIp: { max: 60, windowMs: 60 * 60 * 1000 },
  checkInPerUser: { max: 10, windowMs: 24 * 60 * 60 * 1000 },
} as const;

export type Limit = { max: number; windowMs: number };

export async function isLimited(key: string, limit: Limit, now = new Date()) {
  const since = new Date(now.getTime() - limit.windowMs);
  const [row] = await db
    .select({ n: count() })
    .from(rateEvents)
    .where(and(eq(rateEvents.key, key), gt(rateEvents.createdAt, since)));
  return row.n >= limit.max;
}

export async function record(key: string, now = new Date()) {
  await db.insert(rateEvents).values({ key, createdAt: now });
}

export async function pruneRateEvents(olderThanMs = 2 * 24 * 60 * 60 * 1000, now = new Date()) {
  await db.delete(rateEvents).where(lt(rateEvents.createdAt, new Date(now.getTime() - olderThanMs)));
}
