import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, users } from "@/db/schema";
import { audit } from "./audit";
import { contactEmail, linkSecret } from "./config";
import { sendMail } from "./mail";
import { isLimited, LIMITS, record } from "./rate-limit";
import { parseToken, readLinkUrl } from "./read-link";

// The delivery job (pipeline/courier/links.py) signs the same message, so both sides must match.
function mac(userId: string) {
  return createHmac("sha256", linkSecret()).update(`check-in:${userId}`).digest().subarray(0, 18);
}

export function checkInToken(userId: string) {
  return Buffer.from(userId.replaceAll("-", ""), "hex").toString("base64url") + mac(userId).toString("base64url");
}

export type CheckInAnswer = "yes" | "no";
export type CheckInResult =
  | { ok: true; answer: CheckInAnswer; readLink?: string }
  | { ok: false; reason: "unknown" | "throttled" };

export async function recordCheckIn(token: string, answer: CheckInAnswer, ip: string, now = new Date()): Promise<CheckInResult> {
  const failKey = `check_in_fail:ip:${ip}`;
  if (await isLimited(failKey, LIMITS.readFailuresPerIp, now)) return { ok: false, reason: "throttled" };
  const parsed = parseToken(token);
  const [user] = parsed ? await db.select().from(users).where(eq(users.id, parsed.userId)) : [];
  if (!parsed || !user || !timingSafeEqual(parsed.mac, mac(user.id))) {
    await record(failKey, now);
    return { ok: false, reason: "unknown" };
  }
  const key = `check_in:user:${user.id}`;
  if (await isLimited(key, LIMITS.checkInPerUser, now)) return { ok: false, reason: "throttled" };
  await record(key, now);

  await db.update(users).set({ checkInAnswer: answer, checkInAnsweredAt: now }).where(eq(users.id, user.id));
  await audit("check_in_answered", { userId: user.id, ip, detail: { answer } });
  if (answer === "no" && user.checkInAnswer !== "no") await tellTheEditor(user);
  return answer === "no" ? { ok: true, answer, readLink: readLinkUrl(user) } : { ok: true, answer };
}

// The reader is told someone will write back, so the owner gets every first "no" by email.
async function tellTheEditor(user: typeof users.$inferSelect) {
  const recent = await db
    .select({ date: deliveries.editionDate, status: deliveries.status, error: deliveries.error })
    .from(deliveries)
    .where(eq(deliveries.userId, user.id))
    .orderBy(desc(deliveries.editionDate))
    .limit(5);
  const lines = [
    "A reader answered the check-in email: their paper isn't arriving.",
    "",
    `Account: ${user.email}`,
    `Delivers to: ${user.deliveryEmail ?? "no address"} (${user.deliveryEmailVerifiedAt ? "confirmed" : "not confirmed"})`,
    `Reader: ${user.format ?? "not chosen"}, delivery ${user.deliveryStatus}`,
    "",
    "Recent deliveries:",
    ...(recent.length ? recent.map((d) => `- ${d.date}: ${d.status}${d.error ? ` (${d.error})` : ""}`) : ["- none"]),
    "",
    "If every send says sent, Amazon is most likely dropping it: the reader needs our sending address on their approved list, or their Kindle address has a typo.",
    `Write back to ${user.email}; the page told them we would.`,
  ];
  try {
    await sendMail({ to: contactEmail(), subject: "A reader's paper isn't arriving", text: lines.join("\n") + "\n" });
  } catch (err) {
    console.error("check-in notice to the editor failed", err);
  }
}
