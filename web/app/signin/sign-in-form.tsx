"use client";

import { useActionState } from "react";
import { requestSignInAction, type SignInState } from "@/app/actions/auth";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignInAction, {});
  return (
    <form action={action} noValidate>
      <div className="field">
        <label htmlFor="email">Email address</label>
        <span className="hint" id="email-hint">The same address works for a new account or an existing one.</span>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email}
          aria-describedby={state.error ? "email-hint email-error" : "email-hint"}
          aria-invalid={state.error ? true : undefined}
        />
        <span role="alert" aria-live="polite">
          {state.error && (
            <span className="error" id="email-error">
              {state.error}
            </span>
          )}
        </span>
      </div>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Sending" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
