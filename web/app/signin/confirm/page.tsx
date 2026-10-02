import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Sign in", referrer: "no-referrer" };

export default function ConfirmPage() {
  return (
    <PageShell>
      <h1>Sign in to The Quiet Courier</h1>
      <p className="lede">One more step. Press the button to finish signing in on this device.</p>
      <ConfirmForm />
    </PageShell>
  );
}
