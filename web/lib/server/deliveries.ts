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

export function describeDelivery(row: Delivery | null, timeZone: string | null) {
  if (!row) return null;
  const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${row.editionDate}T00:00:00Z`),
  );
  if (row.status === "sent" && row.sentAt) {
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: timeZone ?? "UTC" })
      .format(row.sentAt)
      .replace(/\s?AM$/, "\u00a0a.m")
      .replace(/\s?PM$/, "\u00a0p.m");
    return `The ${day} edition was sent at ${time}.`;
  }
  if (row.status === "failed") {
    return `The ${day} edition couldn't be sent. We retry every hour until 10 a.m. your time.`;
  }
  return `The ${day} edition is being sent.`;
}
