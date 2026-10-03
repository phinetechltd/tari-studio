"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { callApi } from "@/components/landing/order-events";
import { PayPanel, type PayMethods } from "@/components/payments/pay-panel";
import { formatKES } from "@/lib/money";
import type { Pricing } from "@/lib/pricing";
import { cn } from "@/lib/utils";

import type { Balances } from "./types";

interface WalletResponse {
  balance: Balances;
  methods: PayMethods;
  billingEmail: string | null;
  pricing: Pricing;
}

/**
 * Top up credits without leaving the Studio. Plans (monthly credits at a lower
 * rate) live on the Billing page; this is for "I need a few more now".
 */
export function BuyCredits({
  open,
  onClose,
  onBalances,
  short,
}: {
  open: boolean;
  onClose: () => void;
  onBalances: (b: Balances) => void;
  /** How many credits the user was short of, to pre-select a pack that covers it */
  short?: number | null;
}) {
  const [pack, setPack] = useState<string | null>(null);
  const [info, setInfo] = useState<WalletResponse | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      void callApi<WalletResponse>("/api/billing/wallet").then((r) => {
        if (!r.data) return;
        setInfo(r.data);
        const packs = r.data.pricing.packs;
        const covering = short ? packs.find((p) => p.credits >= short) : null;
        setPack((covering ?? packs[0])?.key ?? null);
      });
    }
    if (!open && d.open) d.close();
  }, [open, short]);

  const refresh = useCallback(async () => {
    const r = await callApi<WalletResponse>("/api/billing/wallet");
    if (r.data) {
      setInfo(r.data);
      onBalances(r.data.balance);
    }
  }, [onBalances]);

  const packs = info?.pricing.packs ?? [];
  const chosen = packs.find((p) => p.key === pack) ?? packs[0] ?? null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="w-[min(100vw-2rem,34rem)] rounded-card border border-line bg-raised p-0 text-ink backdrop:bg-black/60"
      aria-labelledby="buy-credits-title"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="buy-credits-title" className="text-lg font-semibold">Top up credits</h2>
        <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-5">
        {short ? <p className="text-sm text-muted">You need {short} more credits for that generation.</p> : null}
        {info && !info.balance.unmetered ? (
          <p className="text-sm text-muted">
            You have <span className="font-semibold text-ink">{info.balance.credits.toLocaleString("en-KE")}</span> credits.
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Credit pack">
          {packs.map((p) => (
            <button
              key={p.key}
              type="button"
              role="radio"
              aria-checked={pack === p.key}
              onClick={() => setPack(p.key)}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                pack === p.key ? "border-primary/70 bg-primary/10" : "border-line hover:border-wash/25",
              )}
            >
              <span className="flex items-center gap-1 text-lg font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden /> {p.credits.toLocaleString("en-KE")}
              </span>
              <span className="block text-xs text-muted">{formatKES(p.cents)}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">
          Credits never expire. A plan gives you credits every month at a lower rate:{" "}
          <Link href="/billing" className="text-primary hover:underline">
            see plans
          </Link>
          .
        </p>

        {info && chosen ? (
          <PayPanel
            key={chosen.key}
            endpoint="/api/billing/topup"
            body={{ pack: chosen.key }}
            amountCents={chosen.cents}
            methods={info.methods}
            defaultEmail={info.billingEmail}
            onPaid={() => void refresh()}
            cta={`${chosen.credits} credits`}
          />
        ) : (
          <p className="text-sm text-muted">Loading…</p>
        )}
      </div>
    </dialog>
  );
}
