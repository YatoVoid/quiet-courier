"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";
import { confirmSignInAction, type ConfirmState } from "@/app/actions/auth";

const subscribe = () => () => {};
const readHash = () => window.location.hash.slice(1);
const serverHash = () => null;

// The token rides in the URL fragment, which browsers never send to the server, so it
// stays out of access logs, and link scanners that prefetch the URL can't spend it.
export function ConfirmForm() {
  const token = useSyncExternalStore(subscribe, readHash, serverHash);
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmSignInAction, {});

  if (token === null) return null;
  if (!token) {
    return (
      <div className="notice" role="alert">
        <p>This page needs the full link from your email. <Link href="/signin">Request a new link</Link>.</p>
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <span role="alert" aria-live="polite">
        {state.error && (
          <span className="notice notice-block">
            {state.error} <Link href="/signin">Request a new link</Link>.
          </span>
        )}
      </span>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}
