"use client";

import { useActionState, type ReactNode } from "react";
import type { ReferralFormState } from "@/app/actions/referrals";

export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: ReferralFormState, form: FormData) => Promise<ReferralFormState>;
  submitLabel: string;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="admin-form">
      {children}
      {state.error && (
        <p className="error" role="alert">
          {state.error}
        </p>
      )}
      {state.saved && (
        <p className="notice" role="status">
          {state.saved}
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Saving" : submitLabel}
      </button>
    </form>
  );
}
