import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { ProfileForm } from "@/components/profile-form";
import { TestEditionButton } from "@/components/test-edition-button";
import { DeleteAccount } from "@/components/delete-account";
import { pauseAction, resendDeliveryVerificationAction, resumeAction, updateProfileAction } from "@/app/actions/account";
import { signOutAction, signOutEverywhereAction } from "@/app/actions/auth";
import { describeWeatherChoice } from "@/lib/server/places";
import { deliveryLive, describeDelivery, lastDelivery } from "@/lib/server/deliveries";
import { profileInitial, TIME_ZONES } from "@/lib/server/profile-initial";
import { requireOnboardedUser } from "@/lib/server/session";
import { formatLabel } from "@/lib/formats";
import { PRICE_PER_MONTH, TRIAL_DAYS } from "@/lib/site";
import { manageBillingAction } from "@/app/actions/billing";
import { planFor, type Plan } from "@/lib/server/billing";

export const metadata: Metadata = { title: "Your account" };

const NOTICES: Record<string, string> = {
  paused: "Delivery is paused. Nothing will be sent until you resume it.",
  resumed: "Delivery is back on. Your next paper goes out tomorrow morning.",
  "verify-sent": "We sent a new confirmation link to your delivery address.",
  "verify-throttled": "We've sent several confirmation links today already. Try again tomorrow.",
  subscribed: "Thank you for subscribing. A confirmation is on its way to your email.",
  "billing-unavailable": "We couldn't reach our payment provider. Try again in a few minutes.",
};

const longDate = (d: Date, timeZone: string | null) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: timeZone ?? "UTC" }).format(d);

function BillingSection({ plan, timeZone, hasCustomer }: { plan: Plan; timeZone: string | null; hasCustomer: boolean }) {
  const manage = hasCustomer && (
    <form action={manageBillingAction}>
      <button className="link-button" type="submit">
        Manage billing, change card or cancel
      </button>
    </form>
  );
  const subscribe = (
    <Link className="button" href="/subscribe">
      Subscribe for {PRICE_PER_MONTH} a month
    </Link>
  );
  switch (plan.kind) {
    case "off":
      return (
        <p>
          No plan yet, and no card on file. When billing opens, the subscription will be {TRIAL_DAYS} days free and then{" "}
          {PRICE_PER_MONTH} a month. We&rsquo;ll ask before charging anything.
        </p>
      );
    case "waiting":
      return (
        <>
          <p>
            Your {TRIAL_DAYS} free days start with your first paper. No card is needed until then. You can subscribe now and
            keep the free days; the first charge waits until they&rsquo;re over.
          </p>
          <div className="actions-row">{subscribe}{manage}</div>
        </>
      );
    case "trial":
      return (
        <>
          <p>
            Free trial until {longDate(plan.ends, timeZone)}. After that the paper stops unless you subscribe. Nothing is
            charged automatically, and subscribing now keeps the remaining free days.
          </p>
          <div className="actions-row">{subscribe}{manage}</div>
        </>
      );
    case "ended":
      return (
        <>
          <p>Your free trial has ended, so the paper is paused. Subscribe to start it again tomorrow morning.</p>
          <div className="actions-row">{subscribe}{manage}</div>
        </>
      );
    case "subscribed": {
      const date = plan.renews ? longDate(plan.renews, timeZone) : null;
      const line =
        plan.status === "past_due"
          ? "Your last payment didn't go through. Stripe will try the card again; update it to keep the paper coming."
          : plan.ending
            ? `Cancelled. The paper keeps coming until ${date ?? "the end of the paid month"}, then stops. Nothing more will be charged.`
            : plan.status === "trialing"
              ? `Subscribed. The first charge of ${PRICE_PER_MONTH} is on ${date ?? "the day your free days end"}, then monthly.`
              : `Subscribed at ${PRICE_PER_MONTH} a month. Next renewal: ${date ?? "next month"}.`;
      return (
        <>
          <p>{line}</p>
          <div className="actions-row">{manage}</div>
        </>
      );
    }
  }
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireOnboardedUser();
  const { notice } = await searchParams;
  const paused = user.deliveryStatus === "paused";
  const verified = user.deliveryEmailVerifiedAt != null;
  const live = deliveryLive();
  const latest = describeDelivery(await lastDelivery(user.id), user.timeZone);

  return (
    <PageShell>
      <h1>Your account</h1>
      <p className="lede">Signed in as {user.email}.</p>
      {notice && NOTICES[notice] && (
        <div className="notice" role="status">
          <p>{NOTICES[notice]}</p>
        </div>
      )}
      {!live && (
        <div className="notice">
          <p>
            Daily delivery hasn&rsquo;t started yet. We&rsquo;ll email {user.email} before the first edition goes out.
            Until then you can send yourself a test edition.
          </p>
        </div>
      )}

      <h2>Delivery</h2>
      <dl className="ledger">
        <dt>Status</dt>
        <dd>
          {paused
            ? "Paused"
            : planFor(user).kind === "ended"
              ? "Stopped, because the free trial has ended"
              : live
                ? "On, each morning at 5 a.m. your time"
                : "On"}
        </dd>
        {latest && (
          <>
            <dt>Last paper</dt>
            <dd>{latest}</dd>
          </>
        )}
        <dt>Delivered to</dt>
        <dd className="address">{user.deliveryEmail}</dd>
        <dt>Address</dt>
        <dd>{verified ? "Confirmed" : "Waiting for you to open the confirmation link we emailed to it"}</dd>
        <dt>Weather</dt>
        <dd>{await describeWeatherChoice(user)}</dd>
        <dt>Reader</dt>
        <dd>{formatLabel(user.format)}</dd>
      </dl>
      <div className="actions-row spaced">
        <form action={paused ? resumeAction : pauseAction}>
          <button className="button button-quiet" type="submit">
            {paused ? "Resume delivery" : "Pause delivery"}
          </button>
        </form>
        {!verified && (
          <form action={resendDeliveryVerificationAction}>
            <button className="link-button" type="submit">
              Send the confirmation link again
            </button>
          </form>
        )}
      </div>

      <h3>Test edition</h3>
      <p>
        Sends a recent edition to {user.deliveryEmail}. First add our address to your approved senders, as
        the <Link href="/guide">setup guide</Link> shows.
      </p>
      <TestEditionButton />

      <h2>Your paper</h2>
      <ProfileForm
        action={updateProfileAction}
        withTerms={false}
        submitLabel="Save changes"
        timeZones={TIME_ZONES}
        initial={await profileInitial(user)}
      />

      <h2>Billing</h2>
      <BillingSection plan={planFor(user)} timeZone={user.timeZone} hasCustomer={user.stripeCustomerId != null} />

      <h2>Signing in</h2>
      <div className="actions-row">
        <form action={signOutAction}>
          <button className="button button-quiet" type="submit">
            Sign out
          </button>
        </form>
        <form action={signOutEverywhereAction}>
          <button className="link-button" type="submit">
            Sign out on every device
          </button>
        </form>
      </div>

      <h2>Delete your account</h2>
      <p>
        Deletes your account and everything stored with it right away. Delivery stops, and this can&rsquo;t be undone. The
        security log of sign-ins, which holds no email or name, is kept for 90 days and then erased.
      </p>
      <DeleteAccount email={user.email} />
    </PageShell>
  );
}
