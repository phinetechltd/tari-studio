"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";

const SOURCES = [
  ["WHATSAPP", "WhatsApp"],
  ["FACEBOOK", "Facebook"],
  ["INSTAGRAM", "Instagram"],
  ["GOOGLE", "Google"],
  ["DIRECT", "Direct / offline"],
] as const;

/** Midnight in Nairobi for a yyyy-mm-dd date input. */
function nairobiDay(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00+03:00`).toISOString() : undefined;
}

export function NewCampaignForm({ brands, defaultBrandId }: { brands: Array<{ id: string; name: string }>; defaultBrandId?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const budget = String(f.get("budget") ?? "").replace(/[,\s]/g, "");
    if (budget && !/^\d+$/.test(budget)) return setError("Enter the budget in whole shillings, e.g. 15000.");
    setPending(true);
    const r = await callApi<{ campaign: { id: string } }>("/api/campaigns", "POST", {
      brandId: String(f.get("brandId")),
      name: String(f.get("name") ?? ""),
      description: String(f.get("description") ?? "") || undefined,
      source: String(f.get("source")),
      budgetCents: budget ? Number(budget) * 100 : undefined,
      startDate: nairobiDay(String(f.get("startDate") ?? "")),
      endDate: nairobiDay(String(f.get("endDate") ?? "")),
      landingUrl: String(f.get("landingUrl") ?? "") || undefined,
    });
    setPending(false);
    if (!r.ok || !r.data) {
      const issues = (r.error?.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues;
      return setError(issues?.length ? issues.map((i) => `${i.path}: ${i.message}`).join(" ") : r.error?.message ?? "Not created.");
    }
    router.push(`/app/campaigns/${r.data.campaign.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">
          Campaign name
        </label>
        <input id="name" name="name" required minLength={2} maxLength={300} className="input" placeholder="e.g. December meter-sharing offer" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Goal <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea id="description" name="description" rows={3} maxLength={2000} className="input py-2" placeholder="Who it is for and what counts as success" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="brandId">
            Brand
          </label>
          <select id="brandId" name="brandId" required className="input" defaultValue={defaultBrandId ?? (brands.length === 1 ? brands[0]!.id : "")}>
            <option value="" disabled>
              Choose a brand
            </option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="source">
            Main channel
          </label>
          <select id="source" name="source" className="input" defaultValue="WHATSAPP">
            {SOURCES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="budget">
            Budget, KES <span className="font-normal text-muted">(optional)</span>
          </label>
          <input id="budget" name="budget" inputMode="numeric" className="input" placeholder="15000" />
        </div>
        <div>
          <label className="label" htmlFor="startDate">
            Starts
          </label>
          <input id="startDate" name="startDate" type="date" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="endDate">
            Ends
          </label>
          <input id="endDate" name="endDate" type="date" className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="landingUrl">
          Landing page <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="landingUrl" name="landingUrl" type="url" className="input" placeholder="https://" />
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Creating…" : "Create campaign"}
        </button>
        <button type="button" onClick={() => router.push("/app/campaigns")} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
