"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/server/audit";
import { billingEnabled, portalUrl, startCheckout } from "@/lib/server/billing";
import { isLimited, LIMITS, record } from "@/lib/server/rate-limit";
import { clientIp, requireOnboardedUser } from "@/lib/server/session";

export type SubscribeState = { error?: string };

export async function subscribeAction(_prev: SubscribeState, form: FormData): Promise<SubscribeState> {
  const user = await requireOnboardedUser();
  if (!billingEnabled()) redirect("/account");
  if (form.get("agreeRenewal") !== "on") {
    return { error: "Tick the box to agree to the monthly renewal before continuing." };
  }
  const key = `checkout:${user.id}`;
  if (await isLimited(key, LIMITS.checkoutPerUser)) {
    return { error: "Too many attempts in the last hour. Try again later." };
  }
  await record(key);
  let url: string;
  try {
    url = (await startCheckout(user, await clientIp())).url;
  } catch (err) {
    console.error("checkout failed", user.id, err);
    return { error: "We couldn't reach our payment provider. Nothing was charged. Try again in a few minutes." };
  }
  redirect(url);
}

export async function manageBillingAction() {
  const user = await requireOnboardedUser();
  if (!billingEnabled()) redirect("/account");
  let url: string | null;
  try {
    url = await portalUrl(user);
  } catch (err) {
    console.error("billing portal failed", user.id, err);
    redirect("/account?notice=billing-unavailable");
  }
  if (!url) redirect("/subscribe");
  await audit("billing_portal_opened", { userId: user.id, ip: await clientIp() });
  redirect(url);
}
