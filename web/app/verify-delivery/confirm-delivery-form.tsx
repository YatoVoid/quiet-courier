"use client";

import { useActionState, useSyncExternalStore } from "react";
import { confirmDeliveryAction, type VerifyState } from "@/app/actions/account";

const subscribe = () => () => {};
const readHash = () => window.location.hash.slice(1);
const serverHash = () => null;

export function ConfirmDeliveryForm() {
  const token = useSyncExternalStore(subscribe, readHash, serverHash);
  const [state, action, pending] = useActionState<VerifyState, FormData>(confirmDeliveryAction, {});

  if (token === null) return null;
  if (state.done) {
    return (
      <div className="notice" role="status">
        <p>Confirmed. The Quiet Courier can now be delivered to this address.</p>
      </div>
    );
  }
  if (!token) {
    return (
      <div className="notice" role="alert">
        <p>This page needs the full link from the confirmation email.</p>
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <span role="alert" aria-live="polite">
        {state.error && <span className="notice notice-block">{state.error}</span>}
      </span>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Confirming" : "Confirm this address"}
      </button>
    </form>
  );
}
