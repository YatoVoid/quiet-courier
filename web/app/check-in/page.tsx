import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { CopyField } from "@/components/copy-field";
import { contactEmail, editionSender } from "@/lib/server/config";
import { CheckInForm } from "./check-in-form";

export const metadata: Metadata = { title: "Is your paper arriving?", referrer: "no-referrer", robots: { index: false } };

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ answer?: string }> }) {
  const answer = (await searchParams).answer === "no" ? "no" : "yes";
  const sender = editionSender();
  return (
    <PageShell>
      {answer === "yes" ? (
        <>
          <h1>Glad it&rsquo;s arriving</h1>
          <p className="lede">Press the button to let us know. It helps us spot problems early.</p>
          <CheckInForm answer="yes" contact={contactEmail()} />
        </>
      ) : (
        <>
          <h1>Sorry it isn&rsquo;t arriving</h1>
          <p className="lede">
            Amazon drops the paper without telling either of us when something in the setup is off. These three checks
            fix almost every case.
          </p>
          <ol>
            <li>
              Our sending address has to be on your Kindle&rsquo;s <em>Approved Personal Document E-mail List</em>. The{" "}
              <Link href="/guide">setup guide</Link> shows where.
            </li>
            <li>
              The address we deliver to has to match your Send to Kindle address exactly. Compare them on{" "}
              <Link href="/account">your account page</Link>.
            </li>
            <li>
              On the Kindle, connect to Wi-Fi and look in your library under <em>Documents</em> or <em>Docs</em>, not
              only under <em>Books</em>.
            </li>
          </ol>
          <CopyField id="sender-address" label="Our sending address" value={sender} />
          <p>Still nothing? Press the button and we&rsquo;ll look into it with you.</p>
          <CheckInForm answer="no" contact={contactEmail()} />
        </>
      )}
    </PageShell>
  );
}
