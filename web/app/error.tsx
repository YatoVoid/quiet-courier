"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="sheet">
      <main id="main" className="page">
        <h1>This page failed to load</h1>
        <p className="lede">The error has been logged on our side.</p>
        <div className="actions-row">
          <button className="button" type="button" onClick={reset}>
            Try again
          </button>
          <Link href="/">Back to the front page</Link>
        </div>
      </main>
    </div>
  );
}
