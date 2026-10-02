import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";
import { PAPER_NAME, TERMS_VERSION } from "@/lib/site";
import { fieldErrors, isDeviceInbox, profileSchema } from "@/lib/validation";
import type { FormatId } from "@/lib/formats";
import { audit } from "./audit";
import { issueEmailToken, redeemEmailToken, VERIFY_DELIVERY_TTL_MS } from "./auth";
import { cities, cityName } from "./cities";
import { appUrl, editionSender } from "./config";
import { findEdition, readEdition } from "./editions";
import { sendMail } from "./mail";
import { isLimited, LIMITS, record } from "./rate-limit";

export type ProfileInput = { name: string; cityId: string; format: string; deliveryEmail: string; acceptTerms?: boolean };

export type SaveResult =
  | { ok: true; verificationSent: boolean; verificationThrottled: boolean }
  | { ok: false; errors: Record<string, string> };

export function deliveryNeedsVerification(accountEmail: string, deliveryEmail: string) {
  return deliveryEmail !== accountEmail && !isDeviceInbox(deliveryEmail);
}

export async function saveProfile(user: User, input: ProfileInput, ip: string, opts: { requireTerms: boolean }): Promise<SaveResult> {
  const parsed = profileSchema(cities().map((c) => c.id)).safeParse(input);
  const errors = parsed.success ? {} : fieldErrors(parsed.error);
  if (opts.requireTerms && !input.acceptTerms) errors.acceptTerms = "Tick the box to accept the terms and privacy policy.";
  if (!parsed.success || Object.keys(errors).length) return { ok: false, errors };

  const profile = parsed.data;
  const deliveryChanged = profile.deliveryEmail !== user.deliveryEmail;
  const needsVerification = deliveryNeedsVerification(user.email, profile.deliveryEmail);
  const now = new Date();

  await db
    .update(users)
    .set({
      name: profile.name,
      cityId: profile.cityId,
      format: profile.format,
      deliveryEmail: profile.deliveryEmail,
      ...(deliveryChanged ? { deliveryEmailVerifiedAt: needsVerification ? null : now } : {}),
      ...(opts.requireTerms ? { termsVersion: TERMS_VERSION, termsAcceptedAt: now } : {}),
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  if (opts.requireTerms) await audit("terms_accepted", { userId: user.id, ip, detail: { version: TERMS_VERSION } });
  await audit("profile_updated", { userId: user.id, ip, detail: { deliveryChanged } });

  if (!(deliveryChanged && needsVerification)) return { ok: true, verificationSent: false, verificationThrottled: false };
  const sent = await sendDeliveryVerification(user.id, profile.deliveryEmail, ip);
  return { ok: true, verificationSent: sent, verificationThrottled: !sent };
}

export async function sendDeliveryVerification(userId: string, deliveryEmail: string, ip: string) {
  const key = `verify_delivery:user:${userId}`;
  if (await isLimited(key, LIMITS.verifyDeliveryPerUser)) return false;
  await record(key);
  const token = await issueEmailToken("verify_delivery", deliveryEmail, VERIFY_DELIVERY_TTL_MS, userId);
  try {
    await sendMail({
      to: deliveryEmail,
      subject: `Confirm delivery of ${PAPER_NAME} to this address`,
      text: [
        `Someone asked for ${PAPER_NAME}, a daily newspaper, to be delivered to this address.`,
        "",
        "If that was you, confirm here:",
        `${appUrl()}/verify-delivery#${token}`,
        "",
        "The link expires in 48 hours. If it wasn't you, ignore this email and nothing will be sent here.",
      ].join("\n"),
    });
  } catch (err) {
    console.error("delivery verification mail failed", err);
    return false;
  }
  await audit("delivery_verify_sent", { userId, ip });
  return true;
}

// The token only counts if the account still wants delivery to that same address.
export async function confirmDeliveryEmail(token: string, ip: string) {
  const ipKey = `redeem:ip:${ip}`;
  if (await isLimited(ipKey, LIMITS.redeemPerIp)) return false;
  await record(ipKey);
  const redeemed = await redeemEmailToken(token, "verify_delivery");
  if (!redeemed?.userId) return false;
  const updated = await db
    .update(users)
    .set({ deliveryEmailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, redeemed.userId), eq(users.deliveryEmail, redeemed.email)))
    .returning({ id: users.id });
  if (!updated.length) return false;
  await audit("delivery_verified", { userId: redeemed.userId, ip });
  return true;
}

export async function setDeliveryStatus(user: User, status: "active" | "paused", ip: string) {
  await db.update(users).set({ deliveryStatus: status, updatedAt: new Date() }).where(eq(users.id, user.id));
  await audit(status === "paused" ? "delivery_paused" : "delivery_resumed", { userId: user.id, ip });
}

export async function deleteAccount(user: User, ip: string) {
  await db.delete(users).where(eq(users.id, user.id));
  await audit("account_deleted", { userId: user.id, ip });
}

export type TestEditionResult = "sent" | "throttled" | "not_ready" | "unverified" | "missing" | "failed";

export async function sendTestEdition(user: User, ip: string): Promise<TestEditionResult> {
  if (!user.deliveryEmail || !user.cityId || !user.format) return "not_ready";
  if (!user.deliveryEmailVerifiedAt) return "unverified";
  const key = `test_edition:user:${user.id}`;
  if (await isLimited(key, LIMITS.testEditionPerUser)) return "throttled";

  const found = await findEdition(user.cityId, user.format as FormatId);
  if (!found) {
    console.error("no edition file for", user.cityId, user.format);
    return "missing";
  }
  await record(key);
  try {
    const content = await readEdition(found);
    const ext = user.format === "epub" ? "epub" : "pdf";
    await sendMail({
      to: user.deliveryEmail,
      subject: `${PAPER_NAME}, test edition`,
      text: [
        `This is a test edition of ${PAPER_NAME} for ${cityName(user.cityId)}.`,
        "",
        `If it reached your reader, delivery works. If it didn't, check that ${editionSender()} is on your approved senders list.`,
      ].join("\n"),
      attachments: [{ filename: `The Quiet Courier ${found.date ?? "sample"}.${ext}`, content }],
    });
  } catch (err) {
    console.error("test edition failed", err);
    await audit("test_edition_failed", { userId: user.id, ip });
    return "failed";
  }
  await audit("test_edition_sent", { userId: user.id, ip, detail: { file: found.name, date: found.date } });
  return "sent";
}
