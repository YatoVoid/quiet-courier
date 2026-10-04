"use client";

import { useState } from "react";

export function CopyField({ id, label, value }: { id: string; label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      (document.getElementById(id) as HTMLInputElement | null)?.select();
    }
  }
  return (
    <div className="field copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-row">
        <input id={id} type="text" readOnly value={value} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        <button className="button button-quiet" type="button" onClick={copy}>
          Copy
        </button>
      </div>
      <span className="hint" role="status" aria-live="polite">
        {copied ? "Copied." : ""}
      </span>
    </div>
  );
}
