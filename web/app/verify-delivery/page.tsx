import type { Metadata } from "next";
import { PageShell } from "@/components/page-shell";
import { ConfirmDeliveryForm } from "./confirm-delivery-form";

export const metadata: Metadata = { title: "Confirm delivery address", referrer: "no-referrer" };

export default function VerifyDeliveryPage() {
  return (
    <PageShell>
      <h1>Confirm delivery to this address</h1>
      <p className="lede">
        Someone asked for The Quiet Courier to be emailed to this address each morning. If that was you, confirm below. If
        not, close this page and nothing will be sent.
      </p>
      <ConfirmDeliveryForm />
    </PageShell>
  );
}
