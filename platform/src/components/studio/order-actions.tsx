"use client";

import { Clapperboard, LoaderIcon, PackageCheck, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";

/** Production controls on the order page: start in the Studio, deliver, cancel, reopen. */
export function OrderActions({
  orderId,
  status,
  readyFiles,
  canWrite,
}: {
  orderId: string;
  status: string;
  readyFiles: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"deliver" | "cancel" | null>(null);

  if (!canWrite) return null;

  const act = async (action: "start" | "deliver" | "cancel" | "reopen") => {
    setConfirming(null);
    setBusy(action);
    setError(null);
    const r = await callApi<{ threadId?: string; status?: string }>(`/api/order-desk/${orderId}`, {
      method: "POST",
      body: JSON.stringify({ action }),
    });
    setBusy(null);
    if (r.error) {
      setError(r.error);
      return;
    }
    if (action === "start" && r.data?.threadId) router.push(`/content?project=${r.data.threadId}`);
    else router.refresh();
  };

  const canProduce = status === "PAID" || status === "IN_PRODUCTION";
  const Spinner = <LoaderIcon className="h-4 w-4 animate-spin" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {canProduce && (
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={() => void act("start")}>
            {busy === "start" ? Spinner : <Clapperboard className="h-4 w-4" />}
            {status === "PAID" ? "Start in the Studio" : "Open in the Studio"}
          </button>
        )}
        {canProduce && (
          <button
            type="button"
            className="btn-quiet"
            disabled={busy !== null || readyFiles === 0}
            title={readyFiles === 0 ? "Generate at least one file for this order first" : undefined}
            onClick={() => setConfirming("deliver")}
          >
            {busy === "deliver" ? Spinner : <PackageCheck className="h-4 w-4" />}
            Deliver {readyFiles > 0 ? `${readyFiles} file${readyFiles === 1 ? "" : "s"}` : ""}
          </button>
        )}
        {status === "DELIVERED" && (
          <button type="button" className="btn-quiet" disabled={busy !== null} onClick={() => void act("reopen")}>
            {busy === "reopen" ? Spinner : <RotateCcw className="h-4 w-4" />}
            Reopen for a revision
          </button>
        )}
        {(status === "PENDING_PAYMENT" || status === "PAYMENT_FAILED" || status === "QUOTE_REQUESTED") && (
          <button type="button" className="btn-quiet text-danger" disabled={busy !== null} onClick={() => setConfirming("cancel")}>
            {busy === "cancel" ? Spinner : <XCircle className="h-4 w-4" />}
            Cancel order
          </button>
        )}
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Confirm" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <span className="mr-auto text-ink">
            {confirming === "deliver"
              ? `Send ${readyFiles} file${readyFiles === 1 ? "" : "s"} to the customer? They appear on the customer's order page straight away.`
              : "Cancel this order? The customer will see it as cancelled."}
          </span>
          <button type="button" className="btn-primary min-h-[36px] px-3" onClick={() => void act(confirming)}>
            {confirming === "deliver" ? "Yes, deliver" : "Yes, cancel it"}
          </button>
          <button type="button" className="btn-quiet min-h-[36px] px-3" onClick={() => setConfirming(null)}>
            Not yet
          </button>
        </div>
      )}
      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
