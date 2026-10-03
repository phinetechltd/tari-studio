"use client";

import { Gift, MinusCircle, PlusCircle, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { Badge } from "@/components/ui";
import { formatKES } from "@/lib/money";

interface Sub {
  plan: string;
  planName: string;
  cycle: "MONTHLY" | "ANNUAL" | null;
  status: "FREE" | "ACTIVE" | "PAST_DUE" | "EXPIRED";
  currentPeriodEnd: string | null;
  autoRenew: boolean;
  canAutoRenew: boolean;
  cardLabel: string | null;
  paymentMethod: "PAYSTACK" | "MPESA" | "COMP" | null;
  priceCents: number;
  creditsPerMonth: number;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Nairobi" }) : "—");

/**
 * The platform admin's hands on one organisation's money: its plan (give one
 * free, extend it, end it, switch card renewal) and its credits. Every action
 * asks for a reason, which goes into the audit log.
 */
export function OrgBilling({
  orgId,
  sub,
  credits,
  unmetered,
  paidTotalCents,
  plans,
}: {
  orgId: string;
  sub: Sub;
  credits: number;
  unmetered: boolean;
  paidTotalCents: number;
  plans: Array<{ key: string; name: string; creditsPerMonth: number }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const running = sub.status === "ACTIVE" || sub.status === "PAST_DUE";

  async function post(path: string, body: unknown, okText: string, key: string) {
    setBusy(key);
    setMessage(null);
    const r = await callApi(path, "POST", body);
    setBusy(null);
    if (!r.ok) {
      setMessage({ tone: "error", text: r.error?.message ?? "Could not save." });
      return false;
    }
    setMessage({ tone: "ok", text: okText });
    router.refresh();
    return true;
  }

  async function adjust(e: FormEvent<HTMLFormElement>, sign: 1 | -1) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const amount = Math.abs(Math.trunc(Number(data.get("amount"))));
    if (!amount) return setMessage({ tone: "error", text: "Enter how many credits." });
    const ok = await post(
      `/api/platform/orgs/${orgId}/credits`,
      { delta: sign * amount, reason: String(data.get("reason") ?? "") },
      sign > 0 ? `Added ${amount} credits.` : `Removed ${amount} credits.`,
      sign > 0 ? "add" : "remove",
    );
    if (ok) form.reset();
  }

  async function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const plan = String(data.get("plan"));
    if (running && !window.confirm("This replaces the plan they have now. Any saved card is removed, so nothing is charged. Continue?")) return;
    await post(
      `/api/platform/orgs/${orgId}/subscription`,
      { action: "grant", plan, cycle: String(data.get("cycle")), reason: String(data.get("reason") ?? "") },
      "Complimentary plan started; its first month of credits is in the wallet.",
      "grant",
    );
  }

  async function extend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    await post(
      `/api/platform/orgs/${orgId}/subscription`,
      { action: "extend", days: Math.trunc(Number(data.get("days"))), reason: String(data.get("reason") ?? "") },
      "Plan extended.",
      "extend",
    );
  }

  async function end() {
    const reason = window.prompt("End the plan now? Credits stay; workspace limits go back. Why?");
    if (!reason) return;
    await post(`/api/platform/orgs/${orgId}/subscription`, { action: "end", reason }, "Plan ended.", "end");
  }

  return (
    <section aria-labelledby="billing" className="space-y-4">
      <h2 id="billing" className="text-lg font-medium">
        Plan and credits
      </h2>

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : "border-success/40 bg-success/10 text-success"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-poppins text-2xl font-bold uppercase tracking-wide text-ink">{sub.planName}</span>
            {sub.cycle && running ? <span className="text-sm text-muted">{sub.cycle === "ANNUAL" ? "Yearly" : "Monthly"}</span> : null}
            {sub.status === "PAST_DUE" ? <Badge tone="warning">Past due</Badge> : null}
            {sub.status === "EXPIRED" ? <Badge>Ended {day(sub.currentPeriodEnd)}</Badge> : null}
            {sub.paymentMethod === "COMP" && running ? <Badge tone="primary">Complimentary</Badge> : null}
          </div>
          {running ? (
            <ul className="mt-3 space-y-1 text-sm text-muted">
              <li>
                {sub.autoRenew ? "Renews" : "Ends"} on <span className="text-ink">{day(sub.currentPeriodEnd)}</span>
                {sub.priceCents ? ` at ${formatKES(sub.priceCents)}` : ""}
              </li>
              <li>{sub.creditsPerMonth.toLocaleString("en-KE")} credits a month</li>
              <li>
                {sub.paymentMethod === "PAYSTACK" ? `Paystack, ${sub.cardLabel ?? "card"}` : sub.paymentMethod === "COMP" ? "Given by a platform admin" : "M-Pesa (does not renew itself)"}
              </li>
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No running plan: they pay as they go with top-ups.</p>
          )}
          <p className="mt-3 text-sm text-muted">
            Paid to date: <span className="font-medium text-ink">{formatKES(paidTotalCents)}</span>
          </p>

          {running ? (
            <div className="mt-4 space-y-3 border-t border-line pt-4">
              <form onSubmit={extend} className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="label" htmlFor="ext-days">Extend by</label>
                  <input id="ext-days" name="days" type="number" min={1} max={366} defaultValue={7} className="input w-24" required />
                </div>
                <div className="min-w-[12rem] flex-1">
                  <label className="label" htmlFor="ext-reason">Reason</label>
                  <input id="ext-reason" name="reason" className="input" placeholder="e.g. outage on 2 Oct" required minLength={3} />
                </div>
                <button type="submit" className="btn-quiet" disabled={busy !== null}>
                  Extend days
                </button>
              </form>
              <div className="flex flex-wrap gap-2">
                {sub.canAutoRenew ? (
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={busy !== null}
                    onClick={() => void post(`/api/platform/orgs/${orgId}/subscription`, { action: "renewal", on: !sub.autoRenew }, sub.autoRenew ? "Renewal switched off." : "Renewal switched on.", "renewal")}
                  >
                    {sub.autoRenew ? "Turn off renewal" : "Turn renewal on"}
                  </button>
                ) : null}
                <button type="button" className="btn-quiet text-danger" disabled={busy !== null} onClick={() => void end()}>
                  End plan now
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="card p-5">
          <p className="flex items-center gap-2 font-poppins text-2xl font-bold text-ink">
            <Sparkles className="h-6 w-6 text-primary" aria-hidden />
            {unmetered ? "Unmetered" : credits.toLocaleString("en-KE")} <span className="text-sm font-normal text-muted">credits</span>
          </p>
          {unmetered ? <p className="mt-1 text-sm text-muted">The INTERNAL workspace plan is never charged credits.</p> : null}
          <form onSubmit={(e) => void adjust(e, (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "remove" ? -1 : 1)} className="mt-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              <div>
                <label className="label" htmlFor="adj-amount">Credits</label>
                <input id="adj-amount" name="amount" type="number" min={1} className="input w-32" required />
              </div>
              <div className="min-w-[12rem] flex-1">
                <label className="label" htmlFor="adj-reason">Reason</label>
                <input id="adj-reason" name="reason" className="input" placeholder="e.g. refund for failed render" required minLength={3} />
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" value="add" className="btn-primary" disabled={busy !== null}>
                <PlusCircle className="h-4 w-4" /> Add
              </button>
              <button type="submit" value="remove" className="btn-quiet" disabled={busy !== null}>
                <MinusCircle className="h-4 w-4" /> Remove
              </button>
            </div>
          </form>

          <form onSubmit={grant} className="mt-5 space-y-2 border-t border-line pt-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <Gift className="h-4 w-4 text-primary" aria-hidden /> Give a plan without payment
            </p>
            <div className="flex flex-wrap gap-2">
              <select name="plan" className="input w-48" defaultValue="PRO" aria-label="Plan">
                {plans.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.name} · {p.creditsPerMonth.toLocaleString("en-KE")} credits/mo
                  </option>
                ))}
              </select>
              <select name="cycle" className="input w-36" defaultValue="MONTHLY" aria-label="Length">
                <option value="MONTHLY">1 month</option>
                <option value="ANNUAL">12 months</option>
              </select>
            </div>
            <input name="reason" className="input" placeholder="Reason, e.g. launch partner" required minLength={3} aria-label="Reason" />
            <button type="submit" className="btn-quiet" disabled={busy !== null}>
              Start complimentary plan
            </button>
            <p className="text-xs text-muted">It never renews and nothing is charged; it ends by itself when the period is over.</p>
          </form>
        </div>
      </div>
    </section>
  );
}
