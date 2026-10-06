"use server";

import { recordCheckIn } from "@/lib/server/check-in";
import { clientIp } from "@/lib/server/session";

export type CheckInState = { done?: "yes" | "no"; readLink?: string; error?: string };

export async function checkInAction(_prev: CheckInState, form: FormData): Promise<CheckInState> {
  const answer = form.get("answer") === "no" ? "no" : "yes";
  const result = await recordCheckIn(String(form.get("token") ?? ""), answer, await clientIp());
  if (result.ok) return { done: result.answer, readLink: result.readLink };
  return result.reason === "throttled"
    ? { error: "Too many tries from here. Try again in an hour." }
    : { error: "This link isn't complete. Open it again from the email, or write to us." };
}
