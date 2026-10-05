"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { referralLinks, referralPayouts, referrers } from "@/db/schema";
import { requireAdmin } from "@/lib/server/admin";
import { audit } from "@/lib/server/audit";
import { CODE } from "@/lib/server/referrals";
import { clientIp } from "@/lib/server/session";

export type ReferralFormState = { error?: string; saved?: string };

const text = (max: number) => z.string().trim().max(max);
const cents = z
  .string()
  .trim()
  .regex(/^\d{1,4}(\.\d{1,2})?$/, { error: "Enter an amount like 3 or 3.50." })
  .transform((v) => Math.round(Number(v) * 100));
const optionalCount = z
  .string()
  .trim()
  .regex(/^\d{0,6}$/, { error: "Enter a whole number, or leave it empty for no cap." })
  .transform((v) => (v ? Number(v) : null));
const optionalDate = z
  .string()
  .trim()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, { error: "Use a date like 2026-12-31." })
  .transform((v) => v || null);
const code = z
  .string()
  .trim()
  .toLowerCase()
  .regex(CODE, { error: "Codes are 2 to 32 lowercase letters, numbers or dashes." });

const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Check the form.";

async function log(action: string, detail: Record<string, unknown>) {
  const admin = await requireAdmin();
  await audit("admin_referral_changed", { userId: admin.id, ip: await clientIp(), detail: { action, ...detail } });
}

async function codeTaken(c: string) {
  return (await db.select({ code: referralLinks.code }).from(referralLinks).where(eq(referralLinks.code, c))).length > 0;
}

const newReferrer = z.object({
  name: text(120).min(1, { error: "Enter who is being paid." }),
  contact: text(200),
  kind: z.enum(["organization", "individual"]),
  payout: cents,
  maxPayouts: optionalCount,
  endsOn: optionalDate,
  agreedOn: optionalDate,
  code,
  label: text(80),
});

export async function createReferrerAction(_prev: ReferralFormState, form: FormData): Promise<ReferralFormState> {
  await requireAdmin();
  const parsed = newReferrer.safeParse(Object.fromEntries(["name", "contact", "kind", "payout", "maxPayouts", "endsOn", "agreedOn", "code", "label"].map((k) => [k, field(form, k)])));
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  if (d.payout >= 400) return { error: "The payout has to stay below the $4 price so card fees are covered." };
  if (await codeTaken(d.code)) return { error: `The code "${d.code}" is already used. Codes are never reused.` };
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(referrers)
      .values({
        name: d.name,
        contact: d.contact || null,
        kind: d.kind,
        payoutCents: d.payout,
        maxPayouts: d.maxPayouts,
        endsAt: d.endsOn ? new Date(`${d.endsOn}T23:59:59Z`) : null,
        agreedAt: d.agreedOn,
      })
      .returning();
    await tx.insert(referralLinks).values({ code: d.code, referrerId: rows[0].id, label: d.label || null });
    return rows;
  });
  await log("created", { referrerId: created.id, code: d.code });
  redirect(`/admin/referrals/${created.id}`);
}

export async function addLinkAction(_prev: ReferralFormState, form: FormData): Promise<ReferralFormState> {
  await requireAdmin();
  const referrerId = Number(field(form, "referrerId"));
  const parsed = z.object({ code, label: text(80) }).safeParse({ code: field(form, "code"), label: field(form, "label") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  if (await codeTaken(parsed.data.code)) return { error: `The code "${parsed.data.code}" is already used. Codes are never reused.` };
  await db.insert(referralLinks).values({ code: parsed.data.code, referrerId, label: parsed.data.label || null });
  await log("link_added", { referrerId, code: parsed.data.code });
  revalidatePath(`/admin/referrals/${referrerId}`);
  return { saved: `Added quietcourier.com/via/${parsed.data.code}` };
}

const terms = z.object({ payout: cents, maxPayouts: optionalCount, endsOn: optionalDate, agreedOn: optionalDate, w9: z.boolean() });

export async function updateTermsAction(_prev: ReferralFormState, form: FormData): Promise<ReferralFormState> {
  await requireAdmin();
  const referrerId = Number(field(form, "referrerId"));
  const parsed = terms.safeParse({
    payout: field(form, "payout"),
    maxPayouts: field(form, "maxPayouts"),
    endsOn: field(form, "endsOn"),
    agreedOn: field(form, "agreedOn"),
    w9: form.get("w9") === "on",
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  if (d.payout >= 400) return { error: "The payout has to stay below the $4 price so card fees are covered." };
  await db
    .update(referrers)
    .set({
      payoutCents: d.payout,
      maxPayouts: d.maxPayouts,
      endsAt: d.endsOn ? new Date(`${d.endsOn}T23:59:59Z`) : null,
      agreedAt: d.agreedOn,
      w9OnFile: d.w9,
    })
    .where(eq(referrers.id, referrerId));
  await log("terms_updated", { referrerId, payoutCents: d.payout, maxPayouts: d.maxPayouts });
  revalidatePath(`/admin/referrals/${referrerId}`);
  return { saved: "Saved. New terms apply to readers who pay from now on." };
}

export async function setPausedAction(form: FormData) {
  await requireAdmin();
  const referrerId = Number(field(form, "referrerId"));
  const pause = field(form, "pause") === "1";
  await db.update(referrers).set({ pausedAt: pause ? new Date() : null }).where(eq(referrers.id, referrerId));
  await log(pause ? "paused" : "resumed", { referrerId });
  revalidatePath(`/admin/referrals/${referrerId}`);
}

export async function endReferrerAction(form: FormData) {
  await requireAdmin();
  const referrerId = Number(field(form, "referrerId"));
  await db.update(referrers).set({ endsAt: new Date() }).where(eq(referrers.id, referrerId));
  await log("ended", { referrerId });
  revalidatePath(`/admin/referrals/${referrerId}`);
}

const payout = z.object({
  amount: cents.refine((v) => v > 0, { error: "Enter an amount above zero." }),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Use a date like 2026-11-03." }),
  method: z.enum(["Zelle", "PayPal", "Bank transfer", "Other"]),
  note: text(200),
});

export async function recordPayoutAction(_prev: ReferralFormState, form: FormData): Promise<ReferralFormState> {
  await requireAdmin();
  const referrerId = Number(field(form, "referrerId"));
  const parsed = payout.safeParse({ amount: field(form, "amount"), paidOn: field(form, "paidOn"), method: field(form, "method"), note: field(form, "note") });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const d = parsed.data;
  await db.insert(referralPayouts).values({ referrerId, amountCents: d.amount, paidOn: d.paidOn, method: d.method, note: d.note || null });
  await log("payout_recorded", { referrerId, amountCents: d.amount, method: d.method });
  revalidatePath(`/admin/referrals/${referrerId}`);
  return { saved: `Recorded $${(d.amount / 100).toFixed(2)} paid on ${d.paidOn}.` };
}
