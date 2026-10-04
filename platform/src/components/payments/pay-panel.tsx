"use client";

import { CreditCard, LoaderIcon, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { callApi } from "@/components/landing/order-events";
import { StkStatus, type StkPhase } from "@/components/payments/stk-status";
import { formatKES } from "@/lib/money";
import { cn } from "@/lib/utils";

const PHONE_KEY = "tari-mpesa-phone";
const EMAIL_KEY = "tari-billing-email";

export type PayMethod = "MPESA" | "PAYSTACK";

export interface PayMethods {
  mpesa: boolean;
  paystack: boolean;
}

interface StartResult {
  kind: "checkout" | "stk";
  intentId: string;
  checkoutUrl?: string;
  status?: string;
  message?: string | null;
  simulated?: boolean;
}

interface PollResult {
  status: string;
  failureReason: string | null;
  receiptRef: string | null;
  amountCents: number;
}

function remember(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

function recall(key: string): string {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/**
 * Pays for something with M-Pesa (an STK prompt on the phone, polled here until
 * Safaricom confirms) or with Paystack (card, M-Pesa or Apple Pay on Paystack's
 * own page, which sends the customer back to Billing). The server works out the
 * price; `amountCents` is only shown.
 */
export function PayPanel({
  endpoint,
  body,
  amountCents,
  methods,
  defaultEmail,
  onPaid,
  cta,
}: {
  endpoint: string;
  body: Record<string, unknown>;
  amountCents: number;
  methods: PayMethods;
  defaultEmail?: string | null;
  onPaid?: () => void;
  /** Button text before the amount, e.g. "Start Pro" */
  cta?: string;
}) {
  const [method, setMethod] = useState<PayMethod>(methods.mpesa ? "MPESA" : "PAYSTACK");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stk, setStk] = useState<{ intentId: string; phase: StkPhase; poll: PollResult | null; simulated: boolean } | null>(null);

  useEffect(() => {
    setPhone(recall(PHONE_KEY));
    setEmail((e) => e || recall(EMAIL_KEY));
  }, []);

  useEffect(() => {
    if (!stk || stk.phase !== "PROCESSING") return;
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await callApi<PollResult>(`/api/billing/payments/${stk.intentId}`);
      if (!r.data) return;
      const phase: StkPhase = r.data.status === "SUCCEEDED" ? "SUCCEEDED" : r.data.status === "FAILED" ? "FAILED" : "PROCESSING";
      setStk((s) => (s ? { ...s, phase, poll: r.data! } : s));
      if (phase === "SUCCEEDED") onPaid?.();
    }, 3000);
    return () => clearInterval(t);
  }, [stk, onPaid]);

  if (!methods.mpesa && !methods.paystack) {
    return <p className="text-sm text-muted">Payments are not set up on this deployment yet.</p>;
  }

  const pay = async () => {
    setBusy(true);
    setError(null);
    const r = await callApi<StartResult>(endpoint, {
      method: "POST",
      body: JSON.stringify({ ...body, method, phone: method === "MPESA" ? phone : undefined, email: method === "PAYSTACK" ? email : undefined }),
    });
    if (r.error || !r.data) {
      setBusy(false);
      setError(r.error ?? "Something went wrong.");
      return;
    }
    if (r.data.kind === "checkout" && r.data.checkoutUrl) {
      remember(EMAIL_KEY, email);
      window.location.assign(r.data.checkoutUrl);
      return; // leaving the page; keep the button busy
    }
    setBusy(false);
    remember(PHONE_KEY, phone);
    setStk({
      intentId: r.data.intentId,
      phase: r.data.status === "FAILED" ? "FAILED" : "PROCESSING",
      poll: null,
      simulated: Boolean(r.data.simulated),
    });
  };

  if (stk) {
    return (
      <StkStatus
        phase={stk.phase}
        amountCents={amountCents}
        failureReason={stk.poll?.failureReason}
        receiptRef={stk.poll?.receiptRef}
        simulated={stk.simulated}
        phoneLast3={phone.replace(/\D/g, "").slice(-3)}
        onRetry={() => setStk(null)}
      />
    );
  }

  const both = methods.mpesa && methods.paystack;
  return (
    <div className="space-y-3">
      {both && (
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How to pay">
          {(
            [
              { id: "MPESA", label: "M-Pesa", hint: "Prompt on your phone", Icon: Smartphone },
              { id: "PAYSTACK", label: "Card & more", hint: "Visa, Mastercard, M-Pesa, Apple Pay via Paystack", Icon: CreditCard },
            ] as const
          ).map(({ id, label, hint, Icon }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={method === id}
              onClick={() => setMethod(id)}
              className={cn(
                "flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                method === id ? "border-primary/70 bg-primary/10" : "border-line hover:border-wash/25",
              )}
            >
              <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", method === id ? "text-primary" : "text-muted")} aria-hidden />
              <span>
                <span className="block text-sm font-medium text-ink">{label}</span>
                <span className="block text-[11px] leading-snug text-muted">{hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {method === "MPESA" ? (
        <div>
          <label className="label" htmlFor="pay-phone">M-Pesa phone number</label>
          <input
            id="pay-phone"
            className="input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="0712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="pay-email">Email for the receipt</label>
          <input
            id="pay-email"
            className="input"
            type="email"
            autoComplete="email"
            placeholder="you@business.co.ke"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="mt-1 text-[11px] text-muted">You will finish on Paystack&apos;s secure page, then come straight back.</p>
        </div>
      )}

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn-primary w-full"
        disabled={busy || (method === "MPESA" ? phone.trim().length < 9 : !email.includes("@"))}
        onClick={() => void pay()}
      >
        {busy && <LoaderIcon className="h-4 w-4 animate-spin" />}
        {cta ? `${cta} · ` : "Pay "}
        {formatKES(amountCents)}
        {method === "MPESA" ? " with M-Pesa" : " with Paystack"}
      </button>
    </div>
  );
}
