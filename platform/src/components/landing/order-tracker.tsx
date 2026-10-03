"use client";

import { CircleCheck, Clock, Download, LoaderIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { StkStatus, type StkPhase } from "@/components/payments/stk-status";
import { formatKES } from "@/lib/money";
import { cn } from "@/lib/utils";

import { callApi } from "./order-events";

export interface TrackedOrder {
  number: string;
  token: string;
  kind: string;
  status: string;
  brief: string;
  images: number;
  videoSeconds: number;
  credits: number;
  aspectRatio: string | null;
  amountCents: number;
  priced: boolean;
  estimateCents: number;
  createdAt: string;
  paidAt: string | null;
  deliveredAt: string | null;
  payment: {
    status: string;
    failureReason: string | null;
    receiptRef: string | null;
    phoneLast3: string | null;
    method: "MPESA" | "PAYSTACK";
    checkoutUrl: string | null;
    simulated: boolean;
  } | null;
  deliverables: Array<{ id: string; mediaType: string; mimeType: string | null; durationSeconds: number | null; url: string }>;
}

const STAGES = [
  { key: "sent", label: "Request sent" },
  { key: "priced", label: "Price confirmed" },
  { key: "paid", label: "Paid" },
  { key: "production", label: "In production" },
  { key: "delivered", label: "Delivered" },
] as const;

/** How many of the steps above are finished. */
function stepsDone(status: string): number {
  if (status === "DELIVERED") return 5;
  if (status === "IN_PRODUCTION" || status === "PAID") return 3;
  if (status === "PENDING_PAYMENT" || status === "PAYMENT_FAILED") return 2;
  return 1;
}

function paymentPhase(o: TrackedOrder): StkPhase {
  if (["PAID", "IN_PRODUCTION", "DELIVERED"].includes(o.status)) return "SUCCEEDED";
  if (o.payment?.status === "FAILED" || o.status === "PAYMENT_FAILED") return "FAILED";
  return "PROCESSING";
}

export function OrderTracker({ initial, paystack = false }: { initial: TrackedOrder; paystack?: boolean }) {
  const [order, setOrder] = useState(initial);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [email, setEmail] = useState("");

  const refresh = useCallback(async () => {
    const { data } = await callApi<TrackedOrder>(`/api/orders/${order.token}`);
    if (data) setOrder(data);
  }, [order.token]);

  const awaitingPrice = order.status === "REQUESTED";
  // Priced and submitted, but no payment has been started yet.
  const readyToPay = order.status === "PENDING_PAYMENT" && !order.payment;
  const waitingForPayment = order.status === "PENDING_PAYMENT" && !!order.payment;
  const inProduction = order.status === "PAID" || order.status === "IN_PRODUCTION";

  useEffect(() => {
    if (!waitingForPayment && !inProduction && !awaitingPrice) return;
    // Fast while a prompt is on the phone, slow while the team produces.
    const t = setInterval(() => void refresh(), waitingForPayment ? 3000 : 30000);
    return () => clearInterval(t);
  }, [waitingForPayment, inProduction, awaitingPrice, refresh]);

  const retry = async (payWith: "MPESA" | "PAYSTACK") => {
    setRetrying(true);
    setError(null);
    const res = await callApi<TrackedOrder>(`/api/orders/${order.token}/pay`, {
      method: "POST",
      body: JSON.stringify(payWith === "PAYSTACK" ? { payWith, email } : newPhone ? { payWith, phone: newPhone } : { payWith }),
    });
    if (res.data?.payment?.checkoutUrl) {
      window.location.assign(res.data.payment.checkoutUrl);
      return;
    }
    setRetrying(false);
    if (res.error) setError(res.error);
    else if (res.data) setOrder({ ...order, ...res.data });
  };

  const viaPaystack = order.payment?.method === "PAYSTACK";

  const done = stepsDone(order.status);
  const unpaid = order.status === "PENDING_PAYMENT" || order.status === "PAYMENT_FAILED";

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <ol className="grid grid-cols-5 gap-2" aria-label="Order progress">
          {STAGES.map((s, i) => {
            const isDone = i < done;
            const current = i === done && order.status !== "CANCELLED";
            return (
              <li key={s.key} className="flex flex-col items-center gap-2 text-center">
                <span
                  className={cn(
                    "flex h-8 w-8 items-center justify-center rounded-full border text-sm",
                    isDone && "border-success bg-success/10 text-success",
                    current && "border-primary bg-primary/10 text-primary",
                    !isDone && !current && "border-line text-muted",
                  )}
                >
                  {isDone ? <CircleCheck className="h-4 w-4" /> : current ? <Clock className="h-4 w-4" /> : i + 1}
                </span>
                <span className={cn("text-xs sm:text-sm", isDone || current ? "text-ink" : "text-muted")}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {awaitingPrice && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-ink">We are working out your price</h2>
          <p className="mt-2 text-sm text-muted">
            Thank you. The team reviews every request and confirms the price before you pay anything.
            {order.estimateCents > 0 ? ` Our estimate is about ${formatKES(order.estimateCents)}; the final price may differ.` : ""} This page updates by itself
            when it is ready, so you can bookmark it and come back.
          </p>
          <p className="mt-2 text-sm text-muted">Nothing has been charged.</p>
        </div>
      )}

      {readyToPay && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-ink">Your price: {formatKES(order.amountCents)}</h2>
          <p className="mt-2 text-sm text-muted">Pay to start work. You pay only when you enter your PIN, or finish on Paystack's page.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="pay-phone">
                M-Pesa number <span className="font-normal text-muted">(leave empty to use the number you gave us)</span>
              </label>
              <input id="pay-phone" className="input" type="tel" inputMode="tel" placeholder="0712 345 678" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
            </div>
            <button type="button" className="btn-primary" onClick={() => void retry("MPESA")} disabled={retrying}>
              {retrying && <LoaderIcon className="h-4 w-4 animate-spin" />}
              Pay with M-Pesa
            </button>
            {paystack && (
              <>
                <div>
                  <label className="label" htmlFor="pay-email">
                    Card, M-Pesa or Apple Pay on Paystack
                  </label>
                  <input id="pay-email" className="input" type="email" autoComplete="email" placeholder="Email for the receipt" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <button type="button" className="btn-quiet" onClick={() => void retry("PAYSTACK")} disabled={retrying || !email.includes("@")}>
                  Pay with Paystack
                </button>
              </>
            )}
          </div>
          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {unpaid && !readyToPay && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-ink">Payment</h2>
          <div className="mt-4">
            {viaPaystack && paymentPhase(order) === "PROCESSING" ? (
              <div className="rounded-xl border border-line bg-surface p-4 text-sm">
                <p className="text-ink">Waiting for your payment of {formatKES(order.amountCents)} on Paystack.</p>
                <p className="mt-1 text-muted">This page updates by itself once Paystack confirms it.</p>
                {order.payment?.checkoutUrl ? (
                  <a href={order.payment.checkoutUrl} className="btn-primary mt-3 inline-flex">
                    Finish paying on Paystack
                  </a>
                ) : null}
              </div>
            ) : (
              <StkStatus
                phase={paymentPhase(order)}
                amountCents={order.amountCents}
                phoneLast3={order.payment?.phoneLast3}
                failureReason={order.payment?.failureReason}
                receiptRef={order.payment?.receiptRef}
                simulated={order.payment?.simulated}
              />
            )}
          </div>
          {paymentPhase(order) === "FAILED" && (
            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="retry-email">
                  Or pay by card, M-Pesa or Apple Pay on Paystack
                </label>
                <input
                  id="retry-email"
                  className="input"
                  type="email"
                  autoComplete="email"
                  placeholder="Email for the receipt"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="button" className="btn-quiet" onClick={() => void retry("PAYSTACK")} disabled={retrying || !email.includes("@")}>
                Pay with Paystack
              </button>
              <div>
                <label className="label" htmlFor="retry-phone">
                  Pay from a different number <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id="retry-phone"
                  className="input"
                  type="tel"
                  inputMode="tel"
                  placeholder="0712 345 678"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                />
              </div>
              <button type="button" className="btn-primary" onClick={() => void retry("MPESA")} disabled={retrying}>
                {retrying && <LoaderIcon className="h-4 w-4 animate-spin" />}
                Send the prompt again
              </button>
            </div>
          )}
          {error && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {inProduction && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-ink">Being made</h2>
          <p className="mt-2 text-sm text-muted">
            Paid {order.paidAt ? new Date(order.paidAt).toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" }) : ""}
            {order.payment?.receiptRef ? `, ${viaPaystack ? "Paystack reference" : "M-Pesa receipt"} ${order.payment.receiptRef}` : ""}. Your files will appear on this page
            when they are ready; it refreshes by itself.
          </p>
        </div>
      )}

      {order.status === "DELIVERED" && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-ink">Your files</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {order.deliverables.map((d) => (
              <figure key={d.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                {d.mediaType === "VIDEO" ? (
                  <video src={d.url} controls playsInline preload="metadata" className="w-full bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.url} alt="Delivered image" className="w-full" />
                )}
                <figcaption className="flex items-center justify-between p-3 text-sm">
                  <span className="text-muted">
                    {d.mediaType === "VIDEO" ? `Video${d.durationSeconds ? `, ${d.durationSeconds} s` : ""}` : "Image"}
                  </span>
                  <a href={`${d.url}?download=1`} className="inline-flex min-h-[40px] items-center gap-1 font-medium text-primary">
                    <Download className="h-4 w-4" /> Download
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {order.status === "CANCELLED" && (
        <div className="card p-6 text-sm text-muted">This order was cancelled.</div>
      )}

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-ink">What you ordered</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Order</dt>
            <dd className="text-ink">
              {order.kind === "VIDEO"
                ? `A ${order.videoSeconds}-second video`
                : order.kind === "QUOTE"
                  ? "A custom request"
                  : `${order.images} image${order.images === 1 ? "" : "s"}`}
              {order.credits ? ` (${order.credits} credits)` : ""}
              {order.aspectRatio ? `, ${order.aspectRatio}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Total</dt>
            <dd className="font-semibold text-ink">{order.priced ? formatKES(order.amountCents) : "To be confirmed"}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted">Brief</dt>
            <dd className="whitespace-pre-wrap text-ink">{order.brief}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
