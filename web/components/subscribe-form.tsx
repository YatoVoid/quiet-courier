"use client";

import { useActionState } from "react";
import { subscribeAction, type SubscribeState } from "@/app/actions/billing";

export function SubscribeForm({ agreement }: { agreement: string }) {
  const [state, action, pending] = useActionState<SubscribeState, FormData>(subscribeAction, {});
  return (
    <form action={action} noValidate>
      <div className="field">
        <label className="check">
          <input type="checkbox" name="agreeRenewal" aria-describedby={state.error ? "renewal-error" : undefined}
            aria-invalid={state.error ? true : undefined} />
          <span>{agreement}</span>
        </label>
        <span role="alert">
          {state.error && <span className="error" id="renewal-error">{state.error}</span>}
        </span>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Opening the payment page" : "Continue to payment"}
      </button>
    </form>
  );
}
