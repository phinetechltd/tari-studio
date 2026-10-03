"use client";

import { Clapperboard, ImageIcon, LoaderIcon, Minus, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { callApi } from "@/components/landing/order-events";
import { StkStatus, type StkPhase } from "@/components/payments/stk-status";
import { formatKES } from "@/lib/money";
import {
  IMAGE_TOKEN_CENTS,
  MAX_IMAGE_TOKENS_PER_PURCHASE,
  MAX_VIDEO_TOKENS_PER_PURCHASE,
  VIDEO_TOKEN_CENTS,
} from "@/lib/pricing";

import type { Balances } from "./types";

const PHONE_KEY = "studio-mpesa-phone";

interface Purchase {
  id: string;
  status: string;
  amountCents: number;
  failureReason: string | null;
  receiptRef?: string | null;
  simulated?: boolean;
  balance?: Balances | null;
}

interface LedgerRow {
  id: string;
  kind: string;
  delta: number;
  reason: string;
  note: string | null;
  createdAt: string;
}

function Stepper({ label, icon, value, max, onChange, price }: {
  label: string;
  icon: ReactNode;
  value: number;
  max: number;
  onChange: (n: number) => void;
  price: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>
        <div>
          <p className="text-sm font-medium text-ink">{label}</p>
          <p className="text-xs text-muted">{formatKES(price)} each</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="btn-quiet h-10 min-h-0 w-10 px-0" aria-label={`Fewer ${label}`} onClick={() => onChange(Math.max(0, value - 1))}>
          <Minus className="h-4 w-4" />
        </button>
        <span className="w-8 text-center text-lg font-semibold tabular-nums text-ink" aria-live="polite">{value}</span>
        <button type="button" className="btn-quiet h-10 min-h-0 w-10 px-0" aria-label={`More ${label}`} onClick={() => onChange(Math.min(max, value + 1))}>
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function BuyTokens({
  open,
  onClose,
  onBalances,
  suggest,
}: {
  open: boolean;
  onClose: () => void;
  onBalances: (b: Balances) => void;
  /** Pre-select what the user was short of */
  suggest?: { kind: "IMAGE" | "VIDEO"; count: number } | null;
}) {
  const [images, setImages] = useState(0);
  const [videos, setVideos] = useState(1);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setPurchase(null);
      setError(null);
      if (suggest) {
        setImages(suggest.kind === "IMAGE" ? suggest.count : 0);
        setVideos(suggest.kind === "VIDEO" ? suggest.count : 0);
      }
      try {
        setPhone(window.localStorage.getItem(PHONE_KEY) ?? "");
      } catch {
        /* storage blocked */
      }
      void callApi<{ ledger: LedgerRow[] }>("/api/tokens").then((r) => setLedger(r.data?.ledger.slice(0, 8) ?? []));
    }
    if (!open && d.open) d.close();
  }, [open, suggest]);

  const phase: StkPhase | null = !purchase
    ? null
    : purchase.status === "SUCCEEDED"
      ? "SUCCEEDED"
      : purchase.status === "FAILED"
        ? "FAILED"
        : "PROCESSING";

  useEffect(() => {
    if (!purchase || phase !== "PROCESSING") return;
    const t = setInterval(async () => {
      const r = await callApi<Purchase>(`/api/tokens/purchase/${purchase.id}`);
      if (r.data) {
        setPurchase((p) => ({ ...p!, ...r.data! }));
        if (r.data.balance) onBalances(r.data.balance);
      }
    }, 3000);
    return () => clearInterval(t);
  }, [purchase, phase, onBalances]);

  const total = images * IMAGE_TOKEN_CENTS + videos * VIDEO_TOKEN_CENTS;

  const pay = async () => {
    setBusy(true);
    setError(null);
    const r = await callApi<Purchase>("/api/tokens/purchase", {
      method: "POST",
      body: JSON.stringify({ imageTokens: images, videoTokens: videos, phone }),
    });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    try {
      window.localStorage.setItem(PHONE_KEY, phone);
    } catch {
      /* ignore */
    }
    setPurchase(r.data!);
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={onClose}
      className="w-[min(100vw-2rem,32rem)] rounded-card border border-line bg-raised p-0 text-ink backdrop:bg-black/50"
      aria-labelledby="buy-tokens-title"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="buy-tokens-title" className="text-lg font-semibold">Buy tokens</h2>
        <button type="button" className="rounded-lg p-2 text-muted hover:bg-surface hover:text-ink" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-4 px-5 py-5">
        {purchase && phase ? (
          <>
            <StkStatus
              phase={phase}
              amountCents={purchase.amountCents}
              failureReason={purchase.failureReason}
              receiptRef={purchase.receiptRef}
              simulated={purchase.simulated}
              phoneLast3={phone.replace(/\D/g, "").slice(-3)}
              onRetry={() => setPurchase(null)}
            />
            {phase === "SUCCEEDED" && (
              <button type="button" className="btn-primary w-full" onClick={onClose}>
                Back to the Studio
              </button>
            )}
          </>
        ) : (
          <>
            <Stepper
              label="Video tokens"
              icon={<Clapperboard className="h-4 w-4" />}
              value={videos}
              max={MAX_VIDEO_TOKENS_PER_PURCHASE}
              onChange={setVideos}
              price={VIDEO_TOKEN_CENTS}
            />
            <Stepper
              label="Image tokens"
              icon={<ImageIcon className="h-4 w-4" />}
              value={images}
              max={MAX_IMAGE_TOKENS_PER_PURCHASE}
              onChange={setImages}
              price={IMAGE_TOKEN_CENTS}
            />
            <p className="text-xs text-muted">One video token makes up to 10 seconds of video. One image token makes one image.</p>
            <div>
              <label className="label" htmlFor="bt-phone">M-Pesa phone number</label>
              <input
                id="bt-phone"
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-danger" role="alert">{error}</p>}
            <button type="button" className="btn-primary w-full" disabled={busy || total === 0 || phone.trim().length < 9} onClick={() => void pay()}>
              {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
              Pay {formatKES(total)} with M-Pesa
            </button>
          </>
        )}

        {ledger.length > 0 && !purchase && (
          <details className="rounded-lg border border-line p-3 text-sm">
            <summary className="cursor-pointer font-medium text-ink">Recent token activity</summary>
            <ul className="mt-2 space-y-1">
              {ledger.map((l) => (
                <li key={l.id} className="flex justify-between gap-3 text-muted">
                  <span>
                    {new Date(l.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}{" "}
                    {l.reason.toLowerCase()} {l.kind.toLowerCase()}
                  </span>
                  <span className={l.delta > 0 ? "text-success" : l.delta < 0 ? "text-ink" : "text-muted"}>
                    {l.delta > 0 ? `+${l.delta}` : l.delta}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </dialog>
  );
}
