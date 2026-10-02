import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { TestEditionButton } from "@/components/test-edition-button";
import { editionSender } from "@/lib/server/config";
import { currentUser, isOnboarded } from "@/lib/server/session";

export const metadata: Metadata = { title: "Setup guide" };

function Screenshot({ children }: { children: React.ReactNode }) {
  return (
    <div className="screenshot-slot" role="img" aria-label={`Screenshot to come: ${children}`}>
      <span>Screenshot to come: {children}</span>
    </div>
  );
}

export default async function GuidePage({ searchParams }: { searchParams: Promise<{ welcome?: string; check?: string }> }) {
  const user = await currentUser();
  const ready = user != null && isOnboarded(user);
  const { welcome, check } = await searchParams;
  const sender = editionSender();

  return (
    <PageShell wide>
      {ready && welcome && (
        <div className="notice" role="status">
          <p>Your paper is set up. Two steps left, both on Amazon&rsquo;s side, then send yourself a test edition.</p>
        </div>
      )}
      {ready && check && (
        <div className="notice" role="status">
          <p>
            Your paper is set up. We sent a confirmation link to {user.deliveryEmail}. Open it before sending a test
            edition, since nothing is sent to an unconfirmed address.
          </p>
        </div>
      )}
      <h1>Getting the paper onto your Kindle</h1>
      <p className="lede">
        Amazon gives every Kindle its own email address, and only accepts files at it from senders you approve. Setup takes
        about five minutes.
      </p>

      <div className="prose">
        <h2>1. Find your Send to Kindle address</h2>
        <p>On a computer or phone:</p>
        <ol>
          <li>
            Go to amazon.com and sign in with the account your Kindle uses.
          </li>
          <li>
            Open <em>Account &amp; Lists</em>, then <em>Content Library</em> (older pages call it <em>Manage Your Content and Devices</em>).
          </li>
          <li>
            Choose the <em>Preferences</em> tab and open <em>Personal Document Settings</em>.
          </li>
          <li>
            Under <em>Send-to-Kindle E-Mail Settings</em>, each of your Kindles is listed with an address ending in @kindle.com. Copy the one for the Kindle you read on.
          </li>
        </ol>
        <Screenshot>Amazon&rsquo;s Personal Document Settings with the Send to Kindle addresses</Screenshot>
        <p>
          On the Kindle itself, the same address is under <em>Settings</em>, <em>All Settings</em>, <em>Your Account</em>, <em>Send-to-Kindle Email</em>.
        </p>

        <h2>2. Approve our sending address</h2>
        <ol>
          <li>
            On the same <em>Personal Document Settings</em> page, find <em>Approved Personal Document E-mail List</em>.
          </li>
          <li>
            Choose <em>Add a new approved e-mail address</em> and enter <span className="address">{sender}</span>.
          </li>
          <li>Save. Amazon drops mail from any address that isn&rsquo;t on this list, without telling either of us.</li>
        </ol>
        <Screenshot>the approved e-mail list with the Courier&rsquo;s address added</Screenshot>
        <p>
          While you&rsquo;re there, leave <em>Personal Document Archiving</em> on. Amazon then keeps each edition in your
          library, and you can read it on another Kindle or in the Kindle app.
        </p>

        <h2>3. Tell us where to send it</h2>
        {ready ? (
          <p>
            Your paper goes to <span className="address">{user.deliveryEmail}</span>. To change it, go to{" "}
            <Link href="/account">your account</Link>.
          </p>
        ) : (
          <p>
            <Link href={user ? "/welcome" : "/signin"}>{user ? "Finish setting up" : "Sign in"}</Link> and paste the
            @kindle.com address into <em>Deliver to</em>.
          </p>
        )}

        <h2>4. Send a test edition</h2>
        <p>
          The test copy should reach your Kindle within about five minutes, as long as it&rsquo;s connected to Wi-Fi. It
          shows up in your library under <em>Documents</em>.
        </p>
        {ready ? <TestEditionButton /> : <p>The button appears here once you&rsquo;re signed in and set up.</p>}

        <h2>If nothing arrives</h2>
        <ul>
          <li>Check that {sender} is on the approved list exactly as written.</li>
          <li>Check that the delivery address matches the one Amazon shows for that Kindle, not another device on your account.</li>
          <li>Turn on Wi-Fi on the Kindle and use <em>Sync Your Kindle</em> from the menu.</li>
          <li>Amazon sometimes emails the account owner when it rejects a document. Look for a message from Amazon about it.</li>
        </ul>

        <h2>Other readers</h2>
        <h3>PocketBook</h3>
        <p>
          Use your @pbsync.com address from Send-to-PocketBook, and add {sender} to its approved senders the same way.
        </p>
        <h3>Boox</h3>
        <p>Install the Kindle app on the Boox, then use the Send to Kindle address Amazon gives that app.</p>
        <h3>Kobo and reMarkable</h3>
        <p>
          Neither accepts files by email, so the paper can&rsquo;t be delivered to them yet. We&rsquo;re working on it.
        </p>
      </div>
    </PageShell>
  );
}
