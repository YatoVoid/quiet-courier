import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isProduction } from "./config";
import { deleteSession, userForSession } from "./auth";

// __Host- makes the browser refuse the cookie unless it is Secure, host-only, and path=/.
export const SESSION_COOKIE = isProduction ? "__Host-qc_session" : "qc_session";

export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function currentUser() {
  return userForSession(await sessionToken());
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/signin");
  return user;
}

export function isOnboarded(user: { termsAcceptedAt: Date | null; timeZone: string | null }) {
  return user.termsAcceptedAt != null && user.timeZone != null;
}

export async function requireOnboardedUser() {
  const user = await requireUser();
  if (!isOnboarded(user)) redirect("/welcome");
  return user;
}

export async function endSession() {
  const token = await sessionToken();
  if (token) await deleteSession(token);
  (await cookies()).delete(SESSION_COOKIE);
}

// nginx sets X-Real-IP from the socket address; the app only listens on 127.0.0.1,
// so the header can't be supplied by a client directly.
export async function clientIp() {
  const h = await headers();
  return h.get("x-real-ip") ?? (isProduction ? "unknown" : "127.0.0.1");
}
