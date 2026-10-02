import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { contactEmail } from "@/lib/server/config";
import { PRICE_PER_MONTH, TERMS_VERSION, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  const email = contactEmail();
  return (
    <PageShell>
      <p className="draft-flag">Draft. Not yet reviewed by a lawyer. Version {TERMS_VERSION}.</p>
      <h1>Terms of service</h1>
      <div className="prose">
        <p>
          These terms cover your use of The Quiet Courier, its website, and the editions we send you. By creating an account
          you agree to them.
        </p>

        <h2>The service</h2>
        <p>
          We assemble a daily newspaper from openly licensed and public domain writing and email it to the address you give
          us. Delivery depends on email providers and on Amazon or your reader&rsquo;s maker, so we can&rsquo;t promise every
          edition arrives on time. When something on our side fails, we&rsquo;ll try to resend it.
        </p>

        <h2>Your account</h2>
        <p>
          You must be at least 18 to subscribe. Sign-in links are sent to your email, so keep that inbox secure. Only give us a
          delivery address you control.
        </p>

        <h2>What&rsquo;s in the paper</h2>
        <p>
          Articles belong to their authors and publishers. Each one is printed with its credit and the license it was released
          under, and those licenses still apply to it. Editions are for your personal reading. Don&rsquo;t resell them or
          republish them as a whole.
        </p>
        <p>The layout, masthead and name of The Quiet Courier are ours.</p>

        <h2>Subscription and billing</h2>
        <p>
          Billing hasn&rsquo;t started. When it does, the plan will be a {TRIAL_DAYS}-day free trial followed by {PRICE_PER_MONTH}{" "}
          a month, renewing monthly until you cancel. Before you are charged we will show the price and renewal terms and ask
          you to agree to them, and we will email you before the trial ends. You&rsquo;ll be able to cancel from your account
          page at any time.
        </p>

        <h2>Ending your account</h2>
        <p>
          You can delete your account from your <Link href="/account">account page</Link> at any time. We may close accounts
          that abuse the service, for example by sending editions to addresses that didn&rsquo;t ask for them.
        </p>

        <h2>No warranty</h2>
        <p>
          The paper is provided as is. We check our sources, but we don&rsquo;t guarantee every article is accurate or
          complete, and articles reflect their authors&rsquo; views. To the extent the law allows, our liability to you is
          limited to what you paid us in the past twelve months.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If we change these terms in a way that matters, we&rsquo;ll email you and ask you to accept the new version.
        </p>

        <h2>Contact</h2>
        <p>
          <a href={`mailto:${email}`}>{email}</a>
        </p>
      </div>
    </PageShell>
  );
}
