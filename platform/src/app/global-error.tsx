"use client";

import { useEffect } from "react";

/**
 * The last line of defence. This replaces the root layout, so it must supply its
 * own <html> and <body>, and it cannot lean on Tailwind classes: the stylesheet
 * arrives through the layout that just failed. Hence inline styles, and hence a
 * plain "reload" rather than a reset() that has nothing to reset.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global] root render failed", error);
  }, [error]);

  return (
    <html lang="en" data-theme="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#070707",
          color: "#e8e8e8",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "28rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            The app could not start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#949494", marginTop: "0.5rem" }}>
            Reloading the page usually fixes this. If it does not, quote this reference to
            support:
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", marginTop: "0.75rem" }}>
              {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.25rem",
              minHeight: "40px",
              padding: "0 1rem",
              borderRadius: "9999px",
              border: "none",
              background: "#2cf0f4",
              color: "#000",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
