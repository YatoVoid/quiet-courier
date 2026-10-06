import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";

// firstPaper: the reader has never had a paper go out. The pipeline keeps retrying those all day
// instead of stopping at 10 a.m.
type Delivery = typeof deliveries.$inferSelect & { firstPaper?: boolean };

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
  if (!row) return null;
  const [sent] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(and(eq(deliveries.userId, userId), eq(deliveries.status, "sent")))
    .limit(1);
  return { ...row, firstPaper: !sent };
}

// Mirrors the pipeline's Settings: retries stop after 5 attempts or at 10 a.m. reader time, or at the
// end of the reader's day for a first paper.
const MAX_ATTEMPTS = 5;
const GIVE_UP_HOUR = 10;

function stillRetrying(row: Delivery, timeZone: string, now: Date) {
  if (row.attempts >= MAX_ATTEMPTS) return false;
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", timeZone,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get("year")}-${get("month")}-${get("day")}` === row.editionDate && (row.firstPaper || Number(get("hour")) < GIVE_UP_HOUR);
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
    if (stillRetrying(row, timeZone ?? "UTC", now)) {
      return `The ${day} edition couldn't be sent. We retry every hour ${row.firstPaper ? "for the rest of the day" : "until 10 a.m. your time"}.`;
    }
    return row.backupSentAt
      ? `The ${day} edition couldn't be sent, so we emailed you a link to read it instead. The next paper comes at 5 a.m. as usual.`
      : `The ${day} edition couldn't be sent. The next paper comes at 5 a.m. as usual.`;
  }
  return `The ${day} edition is being sent.`;
}
