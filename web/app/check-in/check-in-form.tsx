"use client";

import { useActionState, useSyncExternalStore } from "react";
import { checkInAction, type CheckInState } from "@/app/actions/check-in";

const subscribe = () => () => {};
const readHash = () => window.location.hash.slice(1);
const serverHash = () => null;

// The token rides in the URL fragment, which never reaches the server or a link scanner, and the
// answer is only recorded when the reader presses the button.
export function CheckInForm({ answer, contact }: { answer: "yes" | "no"; contact: string }) {
  const token = useSyncExternalStore(subscribe, readHash, serverHash);
  const [state, action, pending] = useActionState<CheckInState, FormData>(checkInAction, {});

  if (token === null) return null;
  if (state.done === "yes") {
    return (
      <div className="notice" role="status">
        <p>Thank you. Enjoy the paper.</p>
      </div>
    );
  }
  if (state.done === "no") {
    return (
      <div className="notice" role="status">
        <p>Thank you for telling us. We&rsquo;ll look into it and write back to the email address on your account.</p>
        {state.readLink && (
          <p>
            Meanwhile, your latest paper is here: <a href={state.readLink}>open or download it</a>. The link is private to
            you, so please don&rsquo;t share it.
          </p>
        )}
      </div>
    );
  }
  if (!token) {
    return (
      <div className="notice" role="alert">
        <p>
          This page needs the full link from the email. You can also write to us at <a href={`mailto:${contact}`}>{contact}</a>.
        </p>
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="answer" value={answer} />
      <span role="alert" aria-live="polite">
        {state.error && <span className="notice notice-block">{state.error}</span>}
      </span>
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Sending" : answer === "yes" ? "Yes, it arrives" : "Tell the editor it isn't arriving"}
      </button>
    </form>
  );
}
