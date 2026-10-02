import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { contactEmail } from "@/lib/server/config";
import { PRICE_PER_MONTH, TERMS_EFFECTIVE, TERMS_VERSION, TRIAL_DAYS } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  const email = contactEmail();
  const mail = <a href={`mailto:${email}`}>{email}</a>;
  return (
    <PageShell>
      <h1>Terms of service</h1>
      <p className="lede">Effective {TERMS_EFFECTIVE}. Version {TERMS_VERSION}.</p>
      <div className="prose">
        <div className="notice">
          <p>
            <strong>
              Please read the section called &ldquo;Settling disputes.&rdquo; It says most disputes between us will be decided by
              an arbitrator, not a judge or jury, and that you give up the right to join a class action. You can opt out of it
              within 30 days of creating your account.
            </strong>
          </p>
        </div>
        <p>
          These terms are an agreement between you and The Quiet Courier (&ldquo;we&rdquo;, &ldquo;us&rdquo;). They cover the
          website, your account and the editions we send you. You accept them by ticking the box when you set up your account. If
          you don&rsquo;t agree, don&rsquo;t use the service.
        </p>

        <h2>The service</h2>
        <p>
          We put together a daily newspaper from openly licensed and public domain writing and email it to the address you give
          us. Every article is written by people. We don&rsquo;t use AI to write, rewrite or summarize the news.
        </p>
        <p>
          Delivery depends on email providers and on Amazon or your reader&rsquo;s maker, so we can&rsquo;t promise every edition
          arrives, or arrives on time. When something on our side fails, we try again. We may change, add or remove sections and
          sources, and we may stop the service. If we stop it for good, we&rsquo;ll tell you first and refund any time you paid for
          and didn&rsquo;t receive.
        </p>

        <h2>Your account</h2>
        <ul>
          <li>You must be at least 18.</li>
          <li>Give us accurate details, and only a delivery address that is yours or that you are allowed to use.</li>
          <li>Sign-in links go to your email, so keep that inbox secure. You are responsible for what happens in your account.</li>
          <li>One person per account. Don&rsquo;t share or sell it.</li>
        </ul>

        <h2>Using the service fairly</h2>
        <p>You agree not to:</p>
        <ul>
          <li>send editions to people who didn&rsquo;t ask for them, or use the service to send anyone unwanted email;</li>
          <li>resell, redistribute or republish editions, or offer them as part of another product;</li>
          <li>scrape the site, overload it, probe it for weaknesses, or get around its limits or security;</li>
          <li>use it for anything unlawful.</li>
        </ul>
        <p>We may suspend or close an account that breaks these rules.</p>

        <h2>What&rsquo;s in the paper</h2>
        <p>
          Articles belong to their authors and publishers. Each one is printed with its credit and the license it was released
          under, and that license still applies to it. Articles reflect their authors&rsquo; views, not ours. Weather forecasts
          come from public weather services and can be wrong; don&rsquo;t rely on them for safety decisions.
        </p>
        <p>
          The name The Quiet Courier, the masthead, the layout and the website are ours. Your subscription lets you read the
          editions sent to you for your own personal use.
        </p>

        <h2>Subscription and billing</h2>
        <p>
          Billing hasn&rsquo;t started, and you won&rsquo;t be charged anything under this version of the terms. When it starts,
          the plan will be a {TRIAL_DAYS}-day free trial followed by {PRICE_PER_MONTH} a month, renewing each month until you
          cancel. Before we charge you, we will show the price and renewal terms, ask you to agree to them separately, and email
          you before the trial ends. You&rsquo;ll be able to cancel online from your account page at any time, and cancelling
          stops the next renewal.
        </p>

        <h2>Ending your account</h2>
        <p>
          You can delete your account from your <Link href="/account">account page</Link> at any time. We may close your account
          if you break these terms, or if we stop the service. The sections on what&rsquo;s in the paper, disclaimers, limits on
          liability, indemnity and settling disputes still apply after an account ends.
        </p>

        <h2>Disclaimers</h2>
        <p>
          <strong>
            The service and every edition are provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent
            the law allows, we make no warranties of any kind, whether express or implied, including warranties of
            merchantability, fitness for a particular purpose, accuracy, and non-infringement. We don&rsquo;t promise the service
            will be uninterrupted or error-free, or that any article is accurate, complete or current.
          </strong>
        </p>

        <h2>Limits on our liability</h2>
        <p>
          <strong>
            To the fullest extent the law allows, we are not liable for any indirect, incidental, special, consequential or
            punitive damages, or for lost profits, data or goodwill, arising from your use of the service. Our total liability
            for any claim about the service is limited to the greater of what you paid us in the twelve months before the claim
            and fifty U.S. dollars.
          </strong>
        </p>
        <p>
          Some places don&rsquo;t allow these exclusions or limits. Where that is so, they apply only as far as the law
          permits, and nothing in these terms limits rights you have that can&rsquo;t be waived.
        </p>

        <h2>Indemnity</h2>
        <p>
          If someone makes a claim against us because you broke these terms or the law while using the service, you agree to
          cover our reasonable costs of dealing with it, including legal fees.
        </p>

        <h2 id="disputes">Settling disputes</h2>
        <p>
          <strong>Talk to us first.</strong> Before starting any claim, email {mail} with your name, your account email and
          what you want. We&rsquo;ll try to settle it with you within 60 days.
        </p>
        <p>
          <strong>Arbitration.</strong> If we can&rsquo;t settle it, you and we agree that any dispute about the service or these
          terms will be resolved by binding individual arbitration, administered by the American Arbitration Association under
          its Consumer Arbitration Rules. The arbitration can be held by video or phone, or in the county where you live. The
          Federal Arbitration Act governs this section. For claims under $10,000, we&rsquo;ll pay the filing and arbitrator fees
          that the rules would have you pay, unless the arbitrator finds the claim frivolous.
        </p>
        <p>
          <strong>Exceptions.</strong> Either of us may bring an individual claim in small claims court instead. Either of us
          may ask a court to stop infringement of intellectual property.
        </p>
        <p>
          <strong>No class actions.</strong> Claims may be brought only on an individual basis, not as a plaintiff or class
          member in any class, collective or representative proceeding, and the arbitrator may not combine claims of different
          people. You and we each give up the right to a jury trial.
        </p>
        <p>
          <strong>Opting out.</strong> You can opt out of arbitration and the class action waiver by emailing {mail} within 30
          days of creating your account, with your name, account email and a sentence saying you opt out. Opting out
          doesn&rsquo;t affect anything else in these terms.
        </p>
        <p>
          If the class action waiver is found unenforceable for a claim, that claim goes to court, not arbitration. If any
          other part of this section is found unenforceable, the rest still applies.
        </p>

        <h2>Governing law</h2>
        <p>
          The laws of the State of Texas and of the United States govern these terms, without regard to conflict of law rules.
          Any dispute that isn&rsquo;t arbitrated will be heard in the state or federal courts in Harris County, Texas. If you
          live outside the United States, you keep any protections your local consumer law gives you that can&rsquo;t be
          contracted away.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          If we change these terms in a way that matters, we&rsquo;ll email you at least 14 days before the change and ask you
          to accept the new version; the old version applies until you do. Changes to the dispute section won&rsquo;t apply to
          a dispute we already knew about.
        </p>

        <h2>The rest</h2>
        <p>
          These terms and the privacy policy are the whole agreement between us about the service. If one part is found
          unenforceable, the rest still applies. If we don&rsquo;t enforce a part right away, we haven&rsquo;t given up the right
          to. You can&rsquo;t transfer your account or these terms to someone else; we may transfer them to whoever takes over
          the service, and we&rsquo;ll tell you if we do.
        </p>

        <h2>Contact</h2>
        <p>Questions, complaints and arbitration opt-outs: {mail}.</p>
      </div>
    </PageShell>
  );
}
