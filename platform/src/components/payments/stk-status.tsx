"use client";

import { CircleCheck, CircleX, LoaderIcon, Smartphone } from "lucide-react";

import { formatKES } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Where an M-Pesa STK payment is, in three steps the payer recognises:
 * prompt sent, PIN entered, paid. Used by the order form, the order page and
 * the Buy tokens dialog.
 */

export type StkPhase = "SENDING" | "PROCESSING" | "SUCCEEDED" | "FAILED";

export function StkStatus({
  phase,
  amountCents,
  phoneLast3,
  failureReason,
  receiptRef,
  simulated,
  onRetry,
  retrying,
}: {
  phase: StkPhase;
  amountCents: number;
  phoneLast3?: string | null;
  failureReason?: string | null;
  receiptRef?: string | null;
  simulated?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const steps = [
    {
      label:
        phase === "SENDING"
          ? "Sending the M-Pesa prompt…"
          : phase === "FAILED" && !phoneLast3
            ? "The prompt could not be sent"
            : `Prompt sent${phoneLast3 ? ` to the number ending ${phoneLast3}` : ""}`,
      state: phase === "SENDING" ? "active" : phase === "FAILED" && !phoneLast3 ? "failed" : "done",
    },
    {
      label:
        phase === "FAILED"
          ? (failureReason ?? "The payment did not go through.")
          : `Enter your M-Pesa PIN to pay ${formatKES(amountCents)}`,
      state: phase === "PROCESSING" ? "active" : phase === "SUCCEEDED" ? "done" : phase === "FAILED" ? "failed" : "todo",
    },
    {
      label: phase === "SUCCEEDED" ? `Paid${receiptRef ? `, receipt ${receiptRef}` : ""}` : "Payment confirmed by Safaricom",
      state: phase === "SUCCEEDED" ? "done" : "todo",
    },
  ] as const;

  return (
    <div className="space-y-3" aria-live="polite">
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                s.state === "done" && "border-success bg-success/10 text-success",
                s.state === "active" && "border-primary bg-primary/10 text-primary",
                s.state === "failed" && "border-danger bg-danger/10 text-danger",
                s.state === "todo" && "border-line text-muted",
              )}
            >
              {s.state === "done" ? (
                <CircleCheck className="h-4 w-4" />
              ) : s.state === "failed" ? (
                <CircleX className="h-4 w-4" />
              ) : s.state === "active" ? (
                <LoaderIcon className="h-4 w-4 animate-spin" />
              ) : (
                <Smartphone className="h-3.5 w-3.5" />
              )}
            </span>
            <span className={cn("text-sm", s.state === "todo" ? "text-muted" : "text-ink", s.state === "failed" && "text-danger")}>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      {phase === "PROCESSING" && (
        <p className="text-xs text-muted">
          Keep this page open. If no prompt appears within a minute, check the number and try again.
        </p>
      )}
      {simulated && (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          Test mode: payments are simulated on this server and no money moves.
        </p>
      )}
      {phase === "FAILED" && onRetry && (
        <button type="button" className="btn-primary" onClick={onRetry} disabled={retrying}>
          {retrying ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Smartphone className="h-4 w-4" />}
          Send the prompt again
        </button>
      )}
    </div>
  );
}
