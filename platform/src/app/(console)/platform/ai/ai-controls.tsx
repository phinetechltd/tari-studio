"use client";

import { Check, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { Badge } from "@/components/ui";
import type { GenerationMode } from "@/lib/generation-models";

/** The platform admin's controls on the AI & credits page. Each saves on its own and refreshes the page. */

type Message = { tone: "ok" | "error"; text: string } | null;

function Feedback({ message }: { message: Message }) {
  if (!message) return null;
  return (
    <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "mt-3 text-sm text-red-300" : "mt-3 text-sm text-success"}>
      {message.text}
    </p>
  );
}

function useSave() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  async function save(path: string, method: "POST" | "PUT" | "PATCH", body: unknown, ok: string): Promise<boolean> {
    setBusy(true);
    setMessage(null);
    const r = await callApi(path, method, body);
    setBusy(false);
    if (!r.ok) {
      setMessage({ tone: "error", text: r.error?.message ?? "Could not save." });
      return false;
    }
    setMessage({ tone: "ok", text: ok });
    router.refresh();
    return true;
  }
  return { busy, message, save };
}

const num = (v: FormDataEntryValue | null): number | null => {
  const s = String(v ?? "").trim().replace(/,/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

/** Record a top-up bought on console.higgsfield.ai, or adjust to match its balance. */
export function CreditMoves() {
  const topup = useSave();
  const adjust = useSave();
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

  async function onTopUp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const credits = num(d.get("credits"));
    if (!credits || credits <= 0 || Number.isNaN(credits)) return;
    const usd = num(d.get("usd"));
    const ok = await topup.save(
      "/api/platform/ai/credits",
      "POST",
      { action: "topup", credits, usd: usd === null || Number.isNaN(usd) ? null : usd, purchasedAt: String(d.get("purchasedAt") || "") || null, note: String(d.get("note") ?? "") },
      `Recorded ${credits.toLocaleString("en-KE")} credits. They expire a year from the purchase date.`,
    );
    if (ok) form.reset();
  }

  async function onAdjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    const credits = num(d.get("credits"));
    if (!credits || Number.isNaN(credits)) return;
    const ok = await adjust.save("/api/platform/ai/credits", "POST", { action: "adjust", credits, note: String(d.get("note") ?? "") }, "Balance adjusted.");
    if (ok) form.reset();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={onTopUp} className="card p-5" aria-labelledby="topup-title">
        <h3 id="topup-title" className="font-semibold">Record a top-up</h3>
        <p className="mt-1 text-sm text-muted">After buying credits on console.higgsfield.ai. Credits expire one year after purchase.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="topup-credits">Credits bought</label>
            <input id="topup-credits" name="credits" inputMode="decimal" required className="input" placeholder="1000" />
          </div>
          <div>
            <label className="label" htmlFor="topup-usd">Paid (US$, optional)</label>
            <input id="topup-usd" name="usd" inputMode="decimal" className="input" placeholder="75" />
          </div>
          <div>
            <label className="label" htmlFor="topup-date">Purchase date</label>
            <input id="topup-date" name="purchasedAt" type="date" max={today} defaultValue={today} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="topup-note">Note (optional)</label>
            <input id="topup-note" name="note" maxLength={200} className="input" placeholder="Invoice HF-1042" />
          </div>
        </div>
        <button type="submit" disabled={topup.busy} className="btn-primary mt-4">
          <Plus className="h-4 w-4" /> {topup.busy ? "Saving…" : "Record top-up"}
        </button>
        <Feedback message={topup.message} />
      </form>

      <form onSubmit={onAdjust} className="card p-5" aria-labelledby="adjust-title">
        <h3 id="adjust-title" className="font-semibold">Match the Higgsfield console</h3>
        <p className="mt-1 text-sm text-muted">If console.higgsfield.ai shows a different balance, add (positive) or remove (negative) the difference.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="adjust-credits">Credits (+ or −)</label>
            <input id="adjust-credits" name="credits" inputMode="decimal" required className="input" placeholder="-12.5" />
          </div>
          <div>
            <label className="label" htmlFor="adjust-note">Why</label>
            <input id="adjust-note" name="note" required minLength={3} maxLength={200} className="input" placeholder="Matched the console on 3 Oct" />
          </div>
        </div>
        <button type="submit" disabled={adjust.busy} className="btn-quiet mt-4">
          <SlidersHorizontal className="h-4 w-4" /> {adjust.busy ? "Saving…" : "Adjust balance"}
        </button>
        <Feedback message={adjust.message} />
      </form>
    </div>
  );
}

/** Alert levels. They warn the platform admins; they never stop customers generating. */
export function BudgetForm({ budget }: { budget: { lowBalanceCredits: number | null; monthlyCredits: number | null; textMonthlyUsd: number | null } }) {
  const { busy, message, save } = useSave();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const values = { lowBalanceCredits: num(d.get("low")), monthlyCredits: num(d.get("monthly")), textMonthlyUsd: num(d.get("text")) };
    if (Object.values(values).some((v) => Number.isNaN(v))) return;
    await save("/api/platform/ai/budget", "PUT", values, "Alert levels saved.");
  }
  return (
    <form onSubmit={onSubmit} className="card p-5" aria-labelledby="budget-title">
      <h3 id="budget-title" className="font-semibold">Alerts and budgets</h3>
      <p className="mt-1 text-sm text-muted">
        Platform admins are told (in the app, by email, and by SMS for low credits) when a level is reached. Nothing is paused: customers keep generating until the provider itself refuses. Leave a box empty for no alert.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="budget-low">Low balance alert (credits)</label>
          <input id="budget-low" name="low" inputMode="decimal" className="input" defaultValue={budget.lowBalanceCredits ?? ""} placeholder="500" />
        </div>
        <div>
          <label className="label" htmlFor="budget-monthly">Higgsfield budget a month (credits)</label>
          <input id="budget-monthly" name="monthly" inputMode="decimal" className="input" defaultValue={budget.monthlyCredits ?? ""} placeholder="5000" />
        </div>
        <div>
          <label className="label" htmlFor="budget-text">Text AI budget a month (US$)</label>
          <input id="budget-text" name="text" inputMode="decimal" className="input" defaultValue={budget.textMonthlyUsd ?? ""} placeholder="50" />
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Monthly budgets alert at 80% and 100%, once each per month.</p>
      <button type="submit" disabled={busy} className="btn-primary mt-4">
        <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save alert levels"}
      </button>
      <Feedback message={message} />
    </form>
  );
}

export interface ModelRowView {
  key: string;
  label: string;
  familyName: string;
  media: "IMAGE" | "VIDEO";
  modes: GenerationMode[];
  enabled: boolean;
  defaultFor: GenerationMode[];
  creditsPerImage: number | null;
  creditsPerStep: number | null;
  /** The price list's rate this model falls back to */
  listRate: number;
  providerMilliCreditsHint: number | null;
  /** Average provider credits per generation (or per 5 s of video) in the last 30 days, from real estimates */
  observedProviderCredits: number | null;
  /** KES value of one credit at the pay-as-you-go rate, for the margin column */
  creditValueCents: number;
  description: string | null;
  limits: string;
}

const MODE_NAMES: Record<GenerationMode, string> = { image: "Image", video: "Video", animate: "Animate", extend: "Extend" };

/** One catalogue model: on or off, default for which modes, and its price. */
export function ModelRow({ model, usdToKes }: { model: ModelRowView; usdToKes: number }) {
  const { busy, message, save } = useSave();
  const [editing, setEditing] = useState(false);
  const rate = model.media === "IMAGE" ? model.creditsPerImage : model.creditsPerStep;
  const charged = rate ?? model.listRate;
  const providerPer = model.observedProviderCredits ?? (model.providerMilliCreditsHint !== null ? model.providerMilliCreditsHint / 1000 : null);
  // Higgsfield credits cost about US$0.075 each at the 1,000-credit pack price.
  const costKes = providerPer !== null ? providerPer * 0.075 * usdToKes : null;
  const revenueKes = (charged * model.creditValueCents) / 100;
  const margin = costKes !== null && revenueKes > 0 ? Math.round(((revenueKes - costKes) / revenueKes) * 100) : null;

  async function toggle() {
    await save(`/api/platform/ai/models/${model.key}`, "PATCH", { enabled: !model.enabled }, model.enabled ? `${model.label} switched off.` : `${model.label} switched on.`);
  }
  async function makeDefault(mode: GenerationMode) {
    await save(`/api/platform/ai/models/${model.key}`, "PATCH", { defaultFor: Array.from(new Set([...model.defaultFor, mode])) }, `${model.label} is now the default for ${MODE_NAMES[mode].toLowerCase()}.`);
  }
  async function onPrice(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const credits = num(d.get("credits"));
    const hint = num(d.get("hint"));
    if (Number.isNaN(credits) || Number.isNaN(hint)) return;
    const body = {
      ...(model.media === "IMAGE" ? { creditsPerImage: credits === null ? null : Math.round(credits) } : { creditsPerStep: credits === null ? null : Math.round(credits) }),
      providerMilliCreditsHint: hint === null ? null : Math.round(hint * 1000),
      description: String(d.get("description") ?? "").trim() || null,
    };
    if (await save(`/api/platform/ai/models/${model.key}`, "PATCH", body, "Saved.")) setEditing(false);
  }

  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-3">
        <div className="font-medium">{model.label}</div>
        <div className="text-xs text-muted">
          {model.familyName} · {model.limits}
        </div>
        {model.description ? <div className="mt-1 max-w-xs text-xs text-muted">{model.description}</div> : null}
      </td>
      <td className="px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={model.enabled}
          aria-label={`${model.label} available to customers`}
          disabled={busy}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${model.enabled ? "bg-primary" : "bg-white/15"}`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${model.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {model.modes.map((m) =>
            model.defaultFor.includes(m) ? (
              <Badge key={m} tone="primary">
                <Check className="mr-1 inline h-3 w-3" aria-hidden />
                {MODE_NAMES[m]}
              </Badge>
            ) : (
              <button
                key={m}
                type="button"
                disabled={busy || !model.enabled}
                onClick={() => makeDefault(m)}
                title={model.enabled ? `Make ${model.label} the default for ${MODE_NAMES[m].toLowerCase()}` : "Switch the model on first"}
                className="rounded-full border border-white/10 px-2.5 py-0.5 text-xs text-muted hover:border-primary/50 hover:text-ink disabled:opacity-50"
              >
                {MODE_NAMES[m]}
              </button>
            ),
          )}
        </div>
      </td>
      <td className="px-4 py-3 tabular-nums">
        {editing ? (
          <form onSubmit={onPrice} className="grid min-w-[220px] gap-2">
            <label className="text-xs text-muted" htmlFor={`credits-${model.key}`}>
              Credits per {model.media === "IMAGE" ? "image" : "started 5 s"} (empty = price list, {model.listRate})
            </label>
            <input id={`credits-${model.key}`} name="credits" inputMode="numeric" className="input" defaultValue={rate ?? ""} />
            <label className="text-xs text-muted" htmlFor={`hint-${model.key}`}>
              Provider credits per {model.media === "IMAGE" ? "image" : "5 s"} (for the margin)
            </label>
            <input id={`hint-${model.key}`} name="hint" inputMode="decimal" className="input" defaultValue={model.providerMilliCreditsHint !== null ? model.providerMilliCreditsHint / 1000 : ""} />
            <label className="text-xs text-muted" htmlFor={`desc-${model.key}`}>What customers see</label>
            <input id={`desc-${model.key}`} name="description" maxLength={200} className="input" defaultValue={model.description ?? ""} />
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="btn-primary min-h-[36px] px-3 text-sm">
                {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn-quiet min-h-[36px] px-3 text-sm" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <>
            <div>
              {charged} credits <span className="text-xs text-muted">/ {model.media === "IMAGE" ? "image" : "5 s"}</span>
            </div>
            <div className="text-xs text-muted">{rate === null ? "Price list rate" : "Own rate"}</div>
            <button type="button" onClick={() => setEditing(true)} className="mt-1 text-xs font-medium text-primary hover:underline">
              Change
            </button>
          </>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {providerPer !== null ? (
          <>
            <div>{providerPer.toLocaleString("en-KE", { maximumFractionDigits: 2 })}</div>
            <div className="text-xs text-muted">{model.observedProviderCredits !== null ? "average, last 30 days" : "your estimate"}</div>
          </>
        ) : (
          <span className="text-xs text-muted">No data yet</span>
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        {margin !== null ? <Badge tone={margin >= 30 ? "success" : margin >= 0 ? "warning" : "danger"}>{margin}%</Badge> : <span className="text-xs text-muted">—</span>}
        <Feedback message={message} />
      </td>
    </tr>
  );
}
