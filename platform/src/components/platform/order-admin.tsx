"use client";

import { LoaderIcon, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";
import { ASPECT_RATIOS } from "@/lib/generation-models";
import { EXTRAS, MAX_IMAGES_PER_ORDER, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Kind = "IMAGE" | "VIDEO" | "QUOTE";

export interface AdminOrderValues {
  id?: string;
  kind: Kind;
  images: number;
  seconds: number;
  aspectRatio: string;
  brief: string;
  extras: string[];
  referenceLink: string;
  name: string;
  phone: string;
  email: string;
  business: string;
  adminNote: string;
  /** Whole shillings */
  priceKes: string;
}

const shillings = (v: string): number | null => {
  const n = Number(v.replace(/[, ]/g, ""));
  return Number.isFinite(n) && n > 0 && Number.isInteger(n) ? n * 100 : null;
};

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label} {hint ? <span className="font-normal text-muted">{hint}</span> : null}
      </label>
      {children}
    </div>
  );
}

/**
 * The order form for platform admins: used both to enter a new order for a
 * customer and to correct an existing one before it is paid. The price is the
 * admin's decision; the calculator's estimate is only a hint.
 */
export function OrderAdminForm({
  mode,
  initial,
  status,
  estimateKes,
  locked,
}: {
  mode: "create" | "edit";
  initial: AdminOrderValues;
  status?: string;
  estimateKes?: number;
  /** Paid orders: details and price are fixed, only the note can change */
  locked?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const set = <K extends keyof AdminOrderValues>(k: K, val: AdminOrderValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const toggleExtra = (key: string) => set("extras", v.extras.includes(key) ? v.extras.filter((x) => x !== key) : [...v.extras, key]);
  const err = (k: string) => (fields[k] ? <p className="mt-1 text-xs text-danger" role="alert">{fields[k]}</p> : null);
  const priceChanged = mode === "edit" && shillings(v.priceKes) !== shillings(initial.priceKes);

  const details = () => ({
    kind: v.kind,
    ...(v.kind === "IMAGE" ? { images: v.images } : {}),
    ...(v.kind === "VIDEO" ? { seconds: v.seconds } : {}),
    aspectRatio: v.kind === "QUOTE" ? null : v.aspectRatio,
    brief: v.brief,
    extras: v.extras,
    referenceLink: v.referenceLink || undefined,
    name: v.name,
    phone: v.phone,
    email: v.email || undefined,
    business: v.business || null,
    adminNote: v.adminNote || null,
  });

  async function save(e: FormEvent, submitAfter: boolean) {
    e.preventDefault();
    setError(null);
    setFields({});
    setNotice(null);
    setBusy(submitAfter ? "submit" : "save");
    const cents = shillings(v.priceKes);

    if (mode === "create") {
      if (!cents) {
        setBusy(null);
        setFields({ amountCents: "Enter the price in whole shillings" });
        return;
      }
      const res = await callApi<{ id: string }>("/api/platform/orders", {
        method: "POST",
        body: JSON.stringify({ ...details(), aspectRatio: v.kind === "QUOTE" ? undefined : v.aspectRatio, amountCents: cents, submit: submitAfter }),
      });
      setBusy(null);
      if (res.error) {
        setError(res.error);
        setFields(res.fields ?? {});
        return;
      }
      router.push(`/platform/orders/${res.data!.id}`);
      return;
    }

    const body: Record<string, unknown> = locked ? { details: { adminNote: v.adminNote || null } } : { details: details() };
    if (!locked && cents && priceChanged) {
      body.amountCents = cents;
      body.reason = reason;
    }
    const res = await callApi(`/api/platform/orders/${v.id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (res.error) {
      setBusy(null);
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    if (submitAfter) {
      const sub = await callApi<{ notified: { sms: boolean; email: boolean } }>(`/api/platform/orders/${v.id}/submit`, { method: "POST", body: "{}" });
      setBusy(null);
      if (sub.error) {
        setError(sub.error);
        return;
      }
      const n = sub.data!.notified;
      setNotice(`Submitted. Customer told by ${[n.sms ? "SMS" : null, n.email ? "email" : null].filter(Boolean).join(" and ") || "nothing yet (no SMS or email went out); share the order link with them"}.`);
    } else {
      setBusy(null);
      setNotice("Saved.");
      setReason("");
    }
    router.refresh();
  }

  const canSubmit = (mode === "create" || status === "REQUESTED") && !locked;

  return (
    <form className="card space-y-6 p-5" onSubmit={(e) => void save(e, false)} noValidate>
      {!locked && (
        <fieldset disabled={locked}>
          <div role="tablist" className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-1">
            {(["IMAGE", "VIDEO", "QUOTE"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={v.kind === k}
                onClick={() => set("kind", k)}
                className={cn("min-h-[40px] rounded-lg px-2 text-sm font-medium", v.kind === k ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink")}
              >
                {k === "IMAGE" ? "Images" : k === "VIDEO" ? "Video" : "Custom"}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <fieldset disabled={locked} className="space-y-5 disabled:opacity-70">
        <div className="grid gap-5 sm:grid-cols-3">
          {v.kind === "IMAGE" && (
            <Field id="oa-images" label="Images">
              <input id="oa-images" className="input" type="number" min={1} max={MAX_IMAGES_PER_ORDER} value={v.images} onChange={(e) => set("images", Number(e.target.value))} />
              {err("images")}
            </Field>
          )}
          {v.kind === "VIDEO" && (
            <Field id="oa-seconds" label="Seconds">
              <input id="oa-seconds" className="input" type="number" min={VIDEO_MIN_SECONDS} max={VIDEO_MAX_SECONDS} value={v.seconds} onChange={(e) => set("seconds", Number(e.target.value))} />
              {err("seconds")}
            </Field>
          )}
          {v.kind !== "QUOTE" && (
            <Field id="oa-aspect" label="Shape">
              <select id="oa-aspect" className="input" value={v.aspectRatio} onChange={(e) => set("aspectRatio", e.target.value)}>
                {ASPECT_RATIOS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </div>

        <Field id="oa-brief" label="Brief">
          <textarea id="oa-brief" className="input min-h-[110px] py-2" value={v.brief} onChange={(e) => set("brief", e.target.value)} />
          {err("brief")}
        </Field>

        <div>
          <p className="label">Also asked for <span className="font-normal text-muted">(priced by you, inside the total)</span></p>
          <div className="flex flex-wrap gap-2">
            {EXTRAS.map((x) => (
              <label key={x.key} className={cn("inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-full border px-3 text-sm", v.extras.includes(x.key) ? "border-primary bg-primary/10 text-ink" : "border-line text-muted")}>
                <input type="checkbox" className="sr-only" checked={v.extras.includes(x.key)} onChange={() => toggleExtra(x.key)} />
                {x.label}
              </label>
            ))}
          </div>
        </div>

        <Field id="oa-ref" label="Reference link" hint="(optional)">
          <input id="oa-ref" className="input" type="url" placeholder="https://" value={v.referenceLink} onChange={(e) => set("referenceLink", e.target.value)} />
          {err("referenceLink")}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="oa-name" label="Customer name">
            <input id="oa-name" className="input" value={v.name} onChange={(e) => set("name", e.target.value)} />
            {err("name")}
          </Field>
          <Field id="oa-phone" label="Phone" hint="(M-Pesa)">
            <input id="oa-phone" className="input" type="tel" placeholder="0712 345 678" value={v.phone} onChange={(e) => set("phone", e.target.value)} />
            {err("phone")}
          </Field>
          <Field id="oa-email" label="Email" hint="(optional)">
            <input id="oa-email" className="input" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} />
            {err("email")}
          </Field>
          <Field id="oa-business" label="Business" hint="(optional)">
            <input id="oa-business" className="input" value={v.business} onChange={(e) => set("business", e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <div className="space-y-5 rounded-xl border border-primary/30 bg-primary/5 p-4">
        <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
          <Field id="oa-price" label="Price (KES)" hint={estimateKes ? `Calculator estimate: KES ${estimateKes.toLocaleString("en-KE")}` : undefined}>
            <input id="oa-price" className="input text-lg font-semibold tabular-nums" inputMode="numeric" disabled={locked} placeholder="e.g. 1500" value={v.priceKes} onChange={(e) => set("priceKes", e.target.value)} />
            {err("amountCents")}
          </Field>
          {priceChanged && mode === "edit" && (
            <Field id="oa-reason" label="Why this price?" hint="(audit log)">
              <input id="oa-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. includes voice-over, agreed on WhatsApp" />
            </Field>
          )}
        </div>
        <Field id="oa-note" label="Internal note" hint="(never shown to the customer)">
          <textarea id="oa-note" className="input min-h-[70px] py-2" value={v.adminNote} onChange={(e) => set("adminNote", e.target.value)} />
        </Field>
      </div>

      {error && (
        <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-quiet" disabled={busy !== null}>
          {busy === "save" && <LoaderIcon className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Save as request" : "Save changes"}
        </button>
        {canSubmit && (
          <button type="button" className="btn-primary" disabled={busy !== null} onClick={(e) => void save(e as unknown as FormEvent, true)}>
            {busy === "submit" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {mode === "create" ? "Create and send to customer" : "Submit to customer"}
          </button>
        )}
      </div>
      {canSubmit && <p className="text-xs text-muted">Submitting sends the customer their price by SMS and email (where we have them); they pay on their private order page.</p>}
    </form>
  );
}
