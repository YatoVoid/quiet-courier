import { billingEnabled, handleStripeEvent, verifyStripeEvent } from "@/lib/server/billing";

export async function POST(req: Request) {
  if (!billingEnabled()) return new Response("Not found", { status: 404 });
  // The signature covers the exact bytes Stripe sent, so the body is read as text, never parsed first.
  const event = verifyStripeEvent(await req.text(), req.headers.get("stripe-signature"));
  if (!event) return new Response("Bad signature", { status: 400 });
  try {
    await handleStripeEvent(event);
  } catch (err) {
    console.error("Stripe event failed", event.id, event.type, err);
    return new Response("Error", { status: 500 });
  }
  return Response.json({ received: true });
}
