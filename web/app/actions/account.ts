"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  confirmDeliveryEmail,
  deleteAccount,
  saveProfile,
  sendDeliveryVerification,
  sendTestEdition,
  setDeliveryStatus,
  type TestEditionResult,
} from "@/lib/server/account";
import { editionSender } from "@/lib/server/config";
import { clientIp, endSession, isOnboarded, requireUser } from "@/lib/server/session";

export type ProfileState = { errors?: Record<string, string>; values?: Record<string, string>; saved?: string };

function readProfile(form: FormData) {
  return {
    name: String(form.get("name") ?? ""),
    cityId: String(form.get("cityId") ?? ""),
    format: String(form.get("format") ?? ""),
    deliveryEmail: String(form.get("deliveryEmail") ?? ""),
    acceptTerms: form.get("acceptTerms") === "on",
  };
}

export async function onboardAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const input = readProfile(form);
  const result = await saveProfile(user, input, await clientIp(), { requireTerms: !isOnboarded(user) });
  if (!result.ok) return { errors: result.errors, values: { ...input, acceptTerms: input.acceptTerms ? "on" : "" } };
  redirect(result.verificationSent ? "/guide?check=delivery" : "/guide?welcome=1");
}

export async function updateProfileAction(_prev: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const input = readProfile(form);
  const result = await saveProfile(user, input, await clientIp(), { requireTerms: false });
  if (!result.ok) return { errors: result.errors, values: input as unknown as Record<string, string> };
  revalidatePath("/account");
  if (result.verificationSent) return { saved: `Saved. We sent a confirmation link to ${input.deliveryEmail.trim().toLowerCase()}. Nothing will be delivered there until it's opened.` };
  if (result.verificationThrottled) return { saved: "Saved. We couldn't send another confirmation link today. Try again tomorrow from this page." };
  return { saved: "Saved." };
}

export async function resendDeliveryVerificationAction() {
  const user = await requireUser();
  if (user.deliveryEmail && !user.deliveryEmailVerifiedAt) {
    const sent = await sendDeliveryVerification(user.id, user.deliveryEmail, await clientIp());
    redirect(`/account?notice=${sent ? "verify-sent" : "verify-throttled"}`);
  }
  redirect("/account");
}

export async function pauseAction() {
  const user = await requireUser();
  await setDeliveryStatus(user, "paused", await clientIp());
  redirect("/account?notice=paused");
}

export async function resumeAction() {
  const user = await requireUser();
  await setDeliveryStatus(user, "active", await clientIp());
  redirect("/account?notice=resumed");
}

export type DeleteState = { error?: string };

export async function deleteAccountAction(_prev: DeleteState, form: FormData): Promise<DeleteState> {
  const user = await requireUser();
  if (String(form.get("confirmEmail") ?? "").trim().toLowerCase() !== user.email) {
    return { error: "Type your account email exactly to confirm." };
  }
  await deleteAccount(user, await clientIp());
  await endSession();
  redirect("/?deleted=1");
}

export type TestEditionState = { result?: TestEditionResult; message?: string };

const TEST_MESSAGES: Record<TestEditionResult, (sender: string) => string> = {
  sent: () => "Sent. It usually shows up in your Kindle library within five minutes. If it doesn't, check the approved sender step above.",
  throttled: () => "You've sent three test editions today. Try again tomorrow.",
  not_ready: () => "Choose your city, reader and delivery address on your account page first.",
  unverified: () => "Your delivery address hasn't been confirmed yet. Open the link we emailed to it, then try again.",
  missing: () => "There's no edition for your city and reader yet. Try again after tomorrow morning's paper is printed.",
  failed: (sender) => `The email couldn't be sent. Try again in a few minutes. If it keeps failing, write to us and mention ${sender}.`,
};

export async function sendTestEditionAction(): Promise<TestEditionState> {
  const user = await requireUser();
  const result = await sendTestEdition(user, await clientIp());
  return { result, message: TEST_MESSAGES[result](editionSender()) };
}

export type VerifyState = { done?: boolean; error?: string };

export async function confirmDeliveryAction(_prev: VerifyState, form: FormData): Promise<VerifyState> {
  const ok = await confirmDeliveryEmail(String(form.get("token") ?? ""), await clientIp());
  return ok ? { done: true } : { error: "This link has expired, was already used, or is for an address the account no longer uses." };
}
