"use client";

import { useEffect } from "react";

/**
 * The public pages. Kept separate from the console boundary so a marketing page
 * can fail without taking the sign-in screen with it.
 */
export default function PublicError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[public] render failed", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          This page failed to load. Nothing was changed.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/" className="btn-quiet">
            Home
          </a>
        </div>
        {error.digest ? <p className="mt-4 text-[11px] text-muted">Reference: {error.digest}</p> : null}
      </div>
    </div>
  );
}
