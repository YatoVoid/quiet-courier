"use client";

import { useActionState } from "react";
import { sendTestEditionAction, type TestEditionState } from "@/app/actions/account";

export function TestEditionButton() {
  const [state, action, pending] = useActionState<TestEditionState>(sendTestEditionAction, {});
  return (
    <form action={action}>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Sending" : "Send me a test edition"}
      </button>
      <p role="status" aria-live="polite">
        {state.message}
      </p>
    </form>
  );
}
