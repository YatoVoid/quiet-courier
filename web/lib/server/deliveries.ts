import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";

type Delivery = typeof deliveries.$inferSelect;

export function deliveryLive() {
  return process.env.DELIVERY_ENABLED === "1";
}

export async function lastDelivery(userId: string): Promise<Delivery | null> {
  const [row] = await db
    .select()
    .from(deliveries)
    .where(eq(deliveries.userId, userId))
    .orderBy(desc(deliveries.editionDate))
    .limit(1);
  return row ?? null;
}

// Mirrors the pipeline's Settings: retries stop after 5 attempts or at 10 a.m. reader time.
const MAX_ATTEMPTS = 5;
const GIVE_UP_HOUR = 10;

function stillRetrying(row: Delivery, timeZone: string, now: Date) {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", timeZone,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}` === row.editionDate && Number(get("hour")) < GIVE_UP_HOUR;
}

export function describeDelivery(row: Delivery | null, timeZone: string | null, now = new Date(), method: "email" | "download" = "email") {
  if (!row) return null;
  const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${row.editionDate}T00:00:00Z`),
  );
  if (row.status === "sent" && row.sentAt) {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? "UTC" })
      .format(row.sentAt)
      .replace(/\s?AM$/, "\u00a0a.m")
      .replace(/\s?PM$/, "\u00a0p.m");
    return method === "download" ? `The ${day} edition was ready at ${time}.` : `The ${day} edition was sent at ${time}.`;
  }
  if (row.status === "failed") {
    return stillRetrying(row, timeZone ?? "UTC", now)
      ? `The ${day} edition couldn't be sent. We retry every hour until 10 a.m. your time.`
      : `The ${day} edition couldn't be sent. The next paper comes at 5 a.m. as usual.`;
  }
  return `The ${day} edition is being sent.`;
}
