import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { TestEditionButton } from "@/components/test-edition-button";
import { CopyField } from "@/components/copy-field";
import { editionSender } from "@/lib/server/config";
import { currentUser, isOnboarded } from "@/lib/server/session";
import approveSender from "@/public/guide/approve-sender.png";
import documentSettings from "@/public/guide/personal-document-settings.png";

export const metadata: Metadata = { title: "Setup guide" };

export default async function GuidePage({ searchParams }: { searchParams: Promise<{ welcome?: string; check?: string }> }) {
  const user = await currentUser();
  const ready = user != null && isOnboarded(user) && user.deliveryMethod === "email";
  const byLink = user != null && isOnboarded(user) && user.deliveryMethod === "download";
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
      {byLink && (
        <div className="notice">
          <p>
            You chose a download link, so none of this is needed. Your link and how to open it on your reader are on{" "}
            <Link href="/account#download">your account page</Link>. This guide is for delivery by email.
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
            Copying it avoids typos, which make Amazon drop every paper.
          </li>
          <li>Save. Amazon drops mail from any address that isn&rsquo;t on this list, without telling either of us.</li>
        </ol>
        <CopyField id="sender-address" label="Our sending address" value={sender} />
        <figure className="guide-shot">
          <Image
            src={approveSender}
            alt="Amazon's Personal Document Settings page. Arrow 1 points to Add a new e-mail address under the approved list, arrow 2 to the box where edition@quietcourier.com is typed, and arrow 3 to the Add Address button."
            sizes="(max-width: 900px) 100vw, 52rem"
          />
          <figcaption>Add a new e-mail address, type edition@quietcourier.com, then Add Address.</figcaption>
        </figure>
        <p>
          While you&rsquo;re there, leave <em>Personal Document Archiving</em> on. Amazon then keeps each edition in your
          library, and you can read it on another Kindle or in the Kindle app.
        </p>
        <figure className="guide-shot">
          <Image
            src={documentSettings}
            alt="The Personal Document Settings section, showing Archiving is Enabled and the Approved Personal Document E-mail List with one address."
            sizes="(max-width: 900px) 100vw, 52rem"
          />
          <figcaption>When you&rsquo;re done: archiving enabled, and the address on the approved list.</figcaption>
        </figure>
        {ready && user.deliveryEmailVerifiedAt && (
          <div className="inline-test">
            <p>
              Added it? Check now: we&rsquo;ll send a test edition to <span className="address">{user.deliveryEmail}</span>.
            </p>
            <TestEditionButton />
          </div>
        )}

        <h2>3. Tell us where to send it</h2>
        {ready ? (
          <p>
            Your paper goes to <span className="address">{user.deliveryEmail}</span>. To change it, go to{" "}
            <Link href="/account">your account</Link>.
          </p>
        ) : (
          <p>
            {byLink ? (
              <>
                To switch to email, choose <em>Email it to my reader</em> on <Link href="/account">your account page</Link>{" "}
                and paste the @kindle.com address into <em>Deliver to</em>.
              </>
            ) : (
              <>
                <Link href={user ? "/welcome" : "/signin"}>{user ? "Finish setting up" : "Sign in"}</Link> and paste the
                @kindle.com address into <em>Deliver to</em>.
              </>
            )}
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
          Neither accepts files by email. Choose <em>Give me a download link</em> under Delivery on your{" "}
          <Link href="/account">account page</Link>: each morning&rsquo;s paper waits behind a private link, and the account
          page shows how to open it on each reader, including as a KOReader catalog. For other ways to get news onto those
          readers, see our <Link href="/guides/daily-news-on-kobo-and-remarkable">Kobo and reMarkable guide</Link>.
        </p>
      </div>
    </PageShell>
  );
}
