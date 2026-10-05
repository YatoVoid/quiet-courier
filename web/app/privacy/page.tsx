import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { contactEmail } from "@/lib/server/config";
import { PRIVACY_EFFECTIVE, PRIVACY_VERSION } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const email = contactEmail();
  const mail = <a href={`mailto:${email}`}>{email}</a>;
  return (
    <PageShell>
      <h1>Privacy policy</h1>
      <p className="lede">Effective {PRIVACY_EFFECTIVE}. Version {PRIVACY_VERSION}.</p>
      <div className="prose">
        <p>
          The Quiet Courier is a daily newspaper emailed to e-reader devices. This page lists what we store about you, why, who
          else sees it, where it is kept, and how to get it deleted. Questions go to {mail}.
        </p>

        <h2>What we store, and why</h2>
        <ul>
          <li>
            Your account email address, to sign you in and to write to you about your subscription. If you sign up but
            don&rsquo;t finish setting up, we send it one reminder a day later, and never another. Needed to provide the
            service.
          </li>
          <li>
            The name printed on your paper, the size of your reader, and either the city you chose for the weather or your
            time zone. Needed to make and time your edition.
          </li>
          <li>
            The address your paper is delivered to, such as your Send to Kindle address, and whether it was confirmed. Needed
            to deliver it.
          </li>
          <li>Which version of the terms you accepted, and when. Kept as a record of the agreement.</li>
          <li>
            A record of each delivery: the date, edition, whether it was sent, and any error. Used to avoid sending twice and to
            fix failures.
          </li>
          <li>
            A security log of sign-ins, sign-in attempts and account changes, with the IP address and time. It holds no names or
            email addresses and is erased after 90 days. Used to protect accounts from misuse.
          </li>
        </ul>
        <p>
          We set one cookie, which keeps you signed in. If you arrive through a partner&rsquo;s link (quietcourier.com/via/&hellip;),
          a second cookie holds that link&rsquo;s short code for 30 days, so the partner can be paid if you subscribe. It
          belongs to this site only, holds nothing about you, and is copied to your account only if you create one. There are no advertising or analytics scripts on the site, and we
          don&rsquo;t track whether you open or read an edition. Because we don&rsquo;t track you across sites, browser
          &ldquo;Do Not Track&rdquo; and Global Privacy Control signals don&rsquo;t change anything we do.
        </p>
        <p>
          We count sign-ups, pauses, cancellations and deliveries from our own records to see how the paper is doing. Those
          counts are not shared with anyone, except that we tell The Conversation, one of our sources, how many subscribers we
          have in total. That number is never tied to a person.
        </p>

        <h2>Who else sees it</h2>
        <ul>
          <li>
            Resend, our email provider in the United States, handles every message we send, so it sees the address and content
            of each one.
          </li>
          <li>Amazon, or your reader&rsquo;s maker, receives each edition at your delivery address.</li>
          <li>
            To print your forecast we send your city&rsquo;s coordinates, never your name or email, to the U.S. National
            Weather Service or the Norwegian Meteorological Institute.
          </li>
          <li>When billing starts, Stripe will handle payments. We will never see or store your card number.</li>
          <li>
            We may disclose information if the law requires it, to protect the service or its users from fraud or abuse, or to
            whoever takes over the service, who would be bound by this policy.
          </li>
        </ul>
        <p>We don&rsquo;t sell your information, share it for advertising, or use it to train AI models.</p>

        <h2>Where it is kept</h2>
        <p>
          The site and its database run on a server we manage in Azerbaijan, and nightly backups are kept on the same server.
          Email passes through Resend in the United States. Wherever you live, your information may be handled in those
          countries, which may have different data protection laws from yours. We protect it the same way everywhere: encrypted
          connections, sign-in tokens and session cookies stored only as hashes, and access limited to the person who runs the
          paper.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Until you delete your account. Deleting it from your account page erases your details and delivery records
          immediately. Copies in our nightly backups are overwritten within 30 days. The security log, which holds no names or
          email addresses, is erased after 90 days.
        </p>

        <h2>Your rights</h2>
        <p>Wherever you live, you can:</p>
        <ul>
          <li>see and change what we store, on your account page;</li>
          <li>delete your account and its data, on your account page;</li>
          <li>ask for a copy of your data in a common format;</li>
          <li>ask us to stop using any of it, or tell us something is wrong.</li>
        </ul>
        <p>
          Email {mail} from your account address for anything not on the account page. We answer within 30 days and don&rsquo;t
          charge for it. You won&rsquo;t be treated differently for using these rights.
        </p>
        <p>
          If you live in the European Economic Area, the United Kingdom or Switzerland, we use your information because it is
          needed for the service you signed up for, and for the security log, because we have a legitimate interest in keeping
          accounts safe. You can also complain to your local data protection authority. If you live in California or another
          U.S. state with a privacy law, the rights above include those that law gives you, and we don&rsquo;t sell or share
          personal information as those laws define it.
        </p>

        <h2>Children</h2>
        <p>
          You must be 18 to subscribe. The Quiet Courier is not meant for children, and we delete any account we learn belongs
          to someone under 13.
        </p>

        <h2>Changes</h2>
        <p>
          If we change what we collect, who we share it with or where it is kept, we&rsquo;ll update this page and email
          subscribers before the change takes effect.
        </p>
      </div>
    </PageShell>
  );
}
