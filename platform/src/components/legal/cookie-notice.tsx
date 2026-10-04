"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "cookie-notice-ok";

/**
 * A short notice that only essential cookies are used. There is nothing to
 * accept or refuse (no analytics or advertising), so one button dismisses it
 * and the choice is remembered on the device.
 */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(window.localStorage.getItem(KEY) !== "1");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  return (
    <div
      role="region"
      aria-label="Cookie notice"
      className="fixed inset-x-3 bottom-3 z-[60] mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-primary/30 bg-raised/95 p-4 text-sm text-ink shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center"
    >
      <p className="text-muted">
        We use only essential cookies, to keep you signed in and remember your theme. No ads, no tracking.{" "}
        <Link href="/cookies" className="text-primary hover:underline">
          Cookie policy
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="text-primary hover:underline">
          Privacy
        </Link>
      </p>
      <button
        type="button"
        className="btn-primary shrink-0"
        onClick={() => {
          try {
            window.localStorage.setItem(KEY, "1");
          } catch {
            /* the notice will simply show again */
          }
          setShow(false);
        }}
      >
        Got it
      </button>
    </div>
  );
}
