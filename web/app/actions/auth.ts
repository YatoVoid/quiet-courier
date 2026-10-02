"use server";

import { redirect } from "next/navigation";
import { completeSignIn, deleteAllSessions, requestSignIn } from "@/lib/server/auth";
import { audit } from "@/lib/server/audit";
import { clientIp, currentUser, endSession, isOnboarded, setSessionCookie } from "@/lib/server/session";

export type SignInState = { error?: string; email?: string };

export async function requestSignInAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get("email") ?? "");
  const result = await requestSignIn(email, await clientIp());
  if (result.ok) redirect("/signin/sent");
  switch (result.reason) {
    case "invalid":
      return { error: result.message, email };
    case "throttled":
      return { error: "Too many sign-in requests from this network. Try again in an hour.", email };
    case "mail":
      return { error: "The sign-in email couldn't be sent. Try again in a few minutes.", email };
  }
}

export type ConfirmState = { error?: string };

export async function confirmSignInAction(_prev: ConfirmState, form: FormData): Promise<ConfirmState> {
  const token = String(form.get("token") ?? "");
  const result = await completeSignIn(token, await clientIp());
  if (result === "throttled") return { error: "Too many attempts from this network. Wait fifteen minutes and try again." };
  if (!result) return { error: "This link has expired or has already been used. Request a new one below." };
  await setSessionCookie(result.sessionToken, result.expiresAt);
  redirect(isOnboarded(result.user) ? "/account" : "/welcome");
}

export async function signOutAction() {
  const user = await currentUser();
  await endSession();
  if (user) await audit("sign_out", { userId: user.id, ip: await clientIp() });
  redirect("/");
}

export async function signOutEverywhereAction() {
  const user = await currentUser();
  if (user) {
    await deleteAllSessions(user.id);
    await audit("sign_out_everywhere", { userId: user.id, ip: await clientIp() });
  }
  await endSession();
  redirect("/signin?signedout=1");
}
