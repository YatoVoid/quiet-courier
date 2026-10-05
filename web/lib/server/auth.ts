import "server-only";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, emailTokens, sessions, users, type User } from "@/db/schema";
import { hashToken, newToken } from "@/lib/tokens";
import { emailSchema } from "@/lib/validation";
import { PAPER_NAME } from "@/lib/site";
import { audit } from "./audit";
import { appUrl } from "./config";
import { sendMail } from "./mail";
import { isLimited, LIMITS, pruneRateEvents, record } from "./rate-limit";
import { attribute, CODE } from "./referrals";

export const SIGN_IN_TTL_MS = 15 * 60 * 1000;
export const VERIFY_DELIVERY_TTL_MS = 48 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 60 * 24 * 60 * 60 * 1000;
export const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

type Purpose = (typeof emailTokens.$inferInsert)["purpose"];

export async function issueEmailToken(
  purpose: Purpose,
  email: string,
  ttlMs: number,
  userId: string | null = null,
  referralCode: string | null = null,
) {
  const token = newToken();
  await db.insert(emailTokens).values({
    tokenHash: hashToken(token),
    purpose,
    email,
    userId,
    referralCode,
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return token;
}

// One UPDATE both checks and spends the token, so two clicks racing can't both succeed.
export async function redeemEmailToken(token: string, purpose: Purpose) {
  if (!token || token.length > 100) return null;
  const [row] = await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailTokens.tokenHash, hashToken(token)),
        eq(emailTokens.purpose, purpose),
        isNull(emailTokens.usedAt),
        gt(emailTokens.expiresAt, new Date()),
      ),
    )
    .returning({ email: emailTokens.email, userId: emailTokens.userId, referralCode: emailTokens.referralCode });
  return row ?? null;
}

export type SignInRequestResult =
  | { ok: true }
  | { ok: false; reason: "invalid"; message: string }
  | { ok: false; reason: "throttled" }
  | { ok: false; reason: "mail" };

// New and returning readers get the same email and the same response, so the form
// never reveals whether an address has an account.
export async function requestSignIn(rawEmail: string, ip: string, referralCode?: string | null): Promise<SignInRequestResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, reason: "invalid", message: parsed.error.issues[0].message };
  const email = parsed.data;

  const ipKey = `sign_in:ip:${ip}`;
  const emailKey = `sign_in:email:${email}`;
  if (await isLimited(ipKey, LIMITS.signInPerIp)) {
    await audit("sign_in_throttled", { ip, detail: { by: "ip" } });
    return { ok: false, reason: "throttled" };
  }
  await record(ipKey);
  if (await isLimited(emailKey, LIMITS.signInPerEmail)) {
    await audit("sign_in_throttled", { ip, detail: { by: "email" } });
    return { ok: true };
  }
  await record(emailKey);

  await pruneExpired();
  const code = referralCode && CODE.test(referralCode) ? referralCode : null;
  const token = await issueEmailToken("sign_in", email, SIGN_IN_TTL_MS, null, code);
  const link = `${appUrl()}/signin/confirm#${token}`;
  try {
    await sendMail({
      to: email,
      subject: `Your sign-in link for ${PAPER_NAME}`,
      text: [
        `Open this link to sign in to ${PAPER_NAME}:`,
        "",
        link,
        "",
        "The link works once and expires in 15 minutes.",
        "If you didn't ask for it, ignore this email. Nothing happens unless the link is opened.",
      ].join("\n"),
    });
  } catch (err) {
    console.error("sign-in mail failed", err);
    return { ok: false, reason: "mail" };
  }
  await audit("sign_in_requested", { ip });
  return { ok: true };
}

export type SignInResult = { sessionToken: string; expiresAt: Date; user: User; isNew: boolean };

export async function completeSignIn(token: string, ip: string): Promise<SignInResult | "throttled" | null> {
  const ipKey = `redeem:ip:${ip}`;
  if (await isLimited(ipKey, LIMITS.redeemPerIp)) return "throttled";
  await record(ipKey);

  const redeemed = await redeemEmailToken(token, "sign_in");
  if (!redeemed) {
    await audit("sign_in_link_rejected", { ip });
    return null;
  }

  const inserted = await db.insert(users).values({ email: redeemed.email }).onConflictDoNothing().returning();
  const isNew = inserted.length > 0;
  const [user] = isNew ? inserted : await db.select().from(users).where(eq(users.email, redeemed.email));
  if (isNew) {
    await audit("account_created", { userId: user.id, ip });
    if (await attribute(user.id, redeemed.referralCode)) user.referredBy = redeemed.referralCode;
  }

  await db
    .update(emailTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(emailTokens.email, redeemed.email), eq(emailTokens.purpose, "sign_in"), isNull(emailTokens.usedAt)));

  const { sessionToken, expiresAt } = await createSession(user.id);
  await audit("sign_in", { userId: user.id, ip });
  return { sessionToken, expiresAt, user, isNew };
}

export async function createSession(userId: string) {
  const sessionToken = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ tokenHash: hashToken(sessionToken), userId, expiresAt });
  return { sessionToken, expiresAt };
}

export async function userForSession(sessionToken: string | undefined): Promise<User | null> {
  if (!sessionToken || sessionToken.length > 100) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hashToken(sessionToken)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row?.user ?? null;
}

export async function deleteSession(sessionToken: string) {
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(sessionToken)));
}

export async function deleteAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

async function pruneExpired() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.delete(emailTokens).where(lt(emailTokens.expiresAt, dayAgo));
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await pruneRateEvents();
  await db.delete(auditEvents).where(lt(auditEvents.createdAt, new Date(Date.now() - AUDIT_RETENTION_MS)));
}
