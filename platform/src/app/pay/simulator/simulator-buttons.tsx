"use client";

import { useState } from "react";

import { callApi } from "@/components/landing/order-events";

/** Pay or decline, then go back the way Paystack would, with ?reference=… */
export function SimulatorButtons({ reference, back }: { reference: string; back: string }) {
  const [busy, setBusy] = useState<"success" | "failed" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const choose = async (outcome: "success" | "failed") => {
    setBusy(outcome);
    setError(null);
    const r = await callApi("/api/payments/paystack/simulator", { method: "POST", body: JSON.stringify({ reference, outcome }) });
    if (r.error) {
      setBusy(null);
      setError(r.error);
      return;
    }
    const url = new URL(back, window.location.origin);
    url.searchParams.set("reference", reference);
    window.location.assign(url.pathname + url.search);
  };

  return (
    <div className="mt-6 space-y-2">
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void choose("success")}
        className="flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#059669] font-semibold text-white hover:bg-[#047857] disabled:opacity-60"
      >
        {busy === "success" ? "Paying…" : "Pay with test card •••• 4081"}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => void choose("failed")}
        className="flex min-h-[44px] w-full items-center justify-center rounded-xl border border-neutral-200 font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
      >
        {busy === "failed" ? "Declining…" : "Decline"}
      </button>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
