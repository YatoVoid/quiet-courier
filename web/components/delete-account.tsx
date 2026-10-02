"use client";

import { useActionState } from "react";
import { deleteAccountAction, type DeleteState } from "@/app/actions/account";

export function DeleteAccount({ email }: { email: string }) {
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteAccountAction, {});
  return (
    <form action={action} noValidate>
      <div className="field">
        <label htmlFor="confirmEmail">Type {email} to confirm</label>
        <input id="confirmEmail" name="confirmEmail" type="email" autoComplete="off"
          aria-describedby={state.error ? "confirm-error" : undefined} aria-invalid={state.error ? true : undefined} />
        <span role="alert">
          {state.error && <span className="error" id="confirm-error">{state.error}</span>}
        </span>
      </div>
      <button className="button button-quiet" type="submit" disabled={pending}>
        {pending ? "Deleting" : "Delete my account"}
      </button>
    </form>
  );
}
