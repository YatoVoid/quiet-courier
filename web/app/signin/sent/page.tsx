import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";

export const metadata: Metadata = { title: "Check your email" };

export default function SentPage() {
  return (
    <PageShell>
      <h1>Check your email</h1>
      <p className="lede">If the address you entered is right, a sign-in link is on its way.</p>
      <div className="prose">
        <p>Open the link on this device. It works once and expires in fifteen minutes.</p>
        <p>
          Nothing after a few minutes? Look in your spam or promotions folder, then <Link href="/signin">try again</Link>.
        </p>
      </div>
    </PageShell>
  );
}
