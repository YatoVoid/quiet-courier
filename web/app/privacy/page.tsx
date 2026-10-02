import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { contactEmail } from "@/lib/server/config";
import { PRIVACY_VERSION } from "@/lib/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  const email = contactEmail();
  return (
    <PageShell>
      <p className="draft-flag">Draft. Not yet reviewed by a lawyer. Version {PRIVACY_VERSION}.</p>
      <h1>Privacy policy</h1>
      <div className="prose">
        <p>
          The Quiet Courier is a daily newspaper emailed to e-reader devices. This page lists what we store about you, why, who
          else sees it, and how to delete it.
        </p>

        <h2>What we store</h2>
        <ul>
          <li>Your account email address, used to sign you in and to write to you about your subscription.</li>
          <li>
            The name printed on your paper, the size of your reader, and either the city you chose for the weather or your
            time zone.
          </li>
          <li>The address your paper is delivered to, such as your Send to Kindle address, and whether it was confirmed.</li>
          <li>When you accepted these terms and which version you accepted.</li>
          <li>
            A security log of sign-ins, sign-in attempts and account changes, with the IP address and time. It holds no names or
            email addresses, and entries are erased after 90 days.
          </li>
        </ul>
        <p>
          We set one cookie, which keeps you signed in. There are no advertising or analytics scripts on the site, and we
          don&rsquo;t track whether you open or read an edition.
        </p>

        <h2>Who else sees it</h2>
        <ul>
          <li>
            Resend, our email provider, handles every message we send, so it sees the address and the content of each one.
          </li>
          <li>Amazon, or your reader&rsquo;s maker, receives each edition at your delivery address.</li>
          <li>
            To print your forecast we send your city&rsquo;s coordinates, never your name or email, to the U.S. National
            Weather Service or the Norwegian Meteorological Institute.
          </li>
          <li>When billing starts, Stripe will handle payments. We will never see or store your card number.</li>
        </ul>
        <p>The site and its database run on our own server in the United States. We don&rsquo;t sell or rent your information.</p>

        <h2>How long we keep it</h2>
        <p>
          Until you delete your account. Deleting it from your account page erases your details immediately. Copies in our
          nightly backups are overwritten within 30 days.
        </p>

        <h2>Your choices</h2>
        <p>
          You can see and change everything we store on your account page, and delete your account there. For a copy of your
          data, or any other question, write to <a href={`mailto:${email}`}>{email}</a>.
        </p>

        <h2>Children</h2>
        <p>The Quiet Courier is not meant for children under 13, and we don&rsquo;t knowingly keep accounts for them.</p>

        <h2>Changes</h2>
        <p>
          If we change what we collect or who we share it with, we&rsquo;ll update this page and email subscribers before the
          change takes effect.
        </p>
      </div>
    </PageShell>
  );
}
