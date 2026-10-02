import "server-only";
import type Stripe from "stripe";
import type { User } from "@/db/schema";
import { PAPER_NAME, PRICE_PER_MONTH } from "@/lib/site";
import { appUrl, contactEmail } from "./config";
import { sendMail } from "./mail";

const longDate = (d: Date, timeZone: string | null) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: timeZone ?? "UTC" }).format(d);

// The auto-renewal laws ask for a written acknowledgment that repeats the terms and says how to cancel.
export function subscriptionConfirmation(user: Pick<User, "email" | "timeZone">, sub: Pick<Stripe.Subscription, "id" | "trial_end">) {
  const firstCharge = sub.trial_end ? new Date(sub.trial_end * 1000) : null;
  const when = firstCharge
    ? `Your free trial continues until ${longDate(firstCharge, user.timeZone)}. The first charge of ${PRICE_PER_MONTH} is on that day.`
    : `You were charged ${PRICE_PER_MONTH} today.`;
  return {
    to: user.email,
    subject: `Your ${PAPER_NAME} subscription`,
    idempotencyKey: `subscription-confirmed/${sub.id}`,
    text: [
      `Thank you for subscribing to ${PAPER_NAME}.`,
      "",
      when,
      `The subscription then renews automatically every month at ${PRICE_PER_MONTH} until you cancel.`,
      "",
      `To cancel, open your account page (${appUrl()}/account) and choose "Manage billing". Cancelling stops the`,
      "next renewal; the paper keeps coming until the end of the month you've paid for, and there are no partial refunds.",
      "",
      `Terms of service: ${appUrl()}/terms`,
      `Questions: ${contactEmail()}`,
      "",
    ].join("\n"),
  };
}

export async function sendSubscriptionConfirmation(user: Pick<User, "email" | "timeZone">, sub: Stripe.Subscription) {
  await sendMail(subscriptionConfirmation(user, sub));
}
