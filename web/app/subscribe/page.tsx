import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
import { SubscribeForm } from "@/components/subscribe-form";
import { billingEnabled, canSubscribe, planFor, trialEndFor } from "@/lib/server/billing";
import { requireOnboardedUser } from "@/lib/server/session";
import { PRICE_PER_MONTH } from "@/lib/site";

export const metadata: Metadata = { title: "Subscribe" };

const longDate = (d: Date, timeZone: string | null) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: timeZone ?? "UTC" }).format(d);

export default async function SubscribePage() {
  if (!billingEnabled()) notFound();
  const user = await requireOnboardedUser();
  if (!canSubscribe(planFor(user))) redirect("/account");
  const trialEnd = trialEndFor(user);
  const firstCharge = trialEnd ? longDate(trialEnd, user.timeZone) : "today";

  return (
    <PageShell>
      <h1>Subscribe</h1>
      <p className="lede">{PRICE_PER_MONTH} a month for the paper every morning.</p>
      <dl className="ledger">
        <dt>Price</dt>
        <dd>{PRICE_PER_MONTH} a month, in U.S. dollars</dd>
        <dt>First charge</dt>
        <dd>{trialEnd ? `${firstCharge}, when your free days end. Nothing is charged before then.` : "Today"}</dd>
        <dt>Renewal</dt>
        <dd>Automatically every month, on the same day, until you cancel</dd>
        <dt>Cancelling</dt>
        <dd>
          Any time, online, from your account page. The paper keeps coming until the end of the month you&rsquo;ve paid for. No
          partial refunds.
        </dd>
      </dl>
      <p className="spaced">
        Payment is handled by Stripe. We never see your card number. Full details are in the{" "}
        <Link href="/terms" target="_blank">terms of service</Link>.
      </p>
      <SubscribeForm
        agreement={`I agree that my subscription starts with a charge of ${PRICE_PER_MONTH} on ${firstCharge} and renews automatically every month at ${PRICE_PER_MONTH} until I cancel.`}
      />
    </PageShell>
  );
}
