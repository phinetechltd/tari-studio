"use client";

import { LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";

const REASONS: Array<{ value: string; label: string }> = [
  { value: "RESTOCK", label: "Restock" },
  { value: "SALE", label: "Sold" },
  { value: "RETURN", label: "Returned" },
  { value: "DAMAGED", label: "Damaged or lost" },
  { value: "ADJUSTMENT", label: "Correction" },
];

export interface Movement {
  id: string;
  delta: number;
  reason: string;
  note: string | null;
  balanceAfter: number;
  createdAt: string;
}

const when = new Intl.DateTimeFormat("en-KE", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Nairobi" });

/** The stock count of a tracked product, with quick changes and the history of every change. */
export function StockPanel({ productId, qty, lowStockAt, movements, canAdjust }: { productId: string; qty: number; lowStockAt: number | null; movements: Movement[]; canAdjust: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("RESTOCK");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n < 0 || amount.trim() === "") return setError("Enter a whole number.");
    const body = mode === "set" ? { setTo: n, reason: "ADJUSTMENT", note } : { delta: mode === "add" ? n : -n, reason, note };
    setBusy(true);
    const res = await callApi(`/api/products/${productId}/stock`, { method: "POST", body: JSON.stringify(body) });
    setBusy(false);
    if (res.error) return setError(res.error);
    setAmount("");
    setNote("");
    router.refresh();
  }

  const status = qty <= 0 ? { text: "Out of stock", cls: "bg-danger/15 text-danger" } : lowStockAt !== null && qty <= lowStockAt ? { text: "Running low", cls: "bg-warning/15 text-warning" } : { text: "In stock", cls: "bg-success/15 text-success" };

  return (
    <section className="card p-5" aria-labelledby="stock-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="stock-h" className="font-semibold text-ink">Stock</h2>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.cls}`}>{status.text}</span>
      </div>
      <p className="mt-2 text-4xl font-semibold tabular-nums text-ink">{qty}</p>
      {lowStockAt !== null && <p className="text-xs text-muted">Warning at {lowStockAt} or fewer</p>}

      {canAdjust && (
        <form method="post" onSubmit={(e) => void apply(e)} className="mt-4 space-y-3" noValidate>
          <div role="tablist" aria-label="Kind of change" className="flex gap-1 rounded-xl bg-surface p-1">
            {(["add", "remove", "set"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                onClick={() => {
                  setMode(m);
                  setReason(m === "add" ? "RESTOCK" : m === "remove" ? "SALE" : "ADJUSTMENT");
                }}
                className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${mode === m ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {m === "add" ? "Add" : m === "remove" ? "Take out" : "Set count"}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input aria-label={mode === "set" ? "New count" : "How many"} className="input w-28" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === "set" ? "New count" : "How many"} />
            {mode !== "set" && (
              <select aria-label="Reason" className="input flex-1" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.filter((r) => r.value !== "ADJUSTMENT").map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            )}
          </div>
          <input aria-label="Note" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Note (optional)" />
          {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <LoaderIcon className="h-4 w-4 animate-spin" />} Update stock
          </button>
        </form>
      )}

      <h3 className="mt-5 text-sm font-semibold text-ink">History</h3>
      {movements.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No changes yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-line text-sm">
          {movements.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 py-2">
              <div>
                <p className="text-ink">
                  <span className={m.delta >= 0 ? "text-success" : "text-danger"}>{m.delta >= 0 ? `+${m.delta}` : m.delta}</span>{" "}
                  <span className="text-muted">{REASONS.find((r) => r.value === m.reason)?.label ?? (m.reason === "INITIAL" ? "Starting count" : m.reason)}</span>
                </p>
                {m.note && <p className="text-xs text-muted">{m.note}</p>}
              </div>
              <div className="text-right text-xs text-muted">
                <p>now {m.balanceAfter}</p>
                <p>{when.format(new Date(m.createdAt))}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
