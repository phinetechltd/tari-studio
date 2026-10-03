"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";

export function NewCatalogueForm({ brands, defaultBrandId }: { brands: Array<{ id: string; name: string }>; defaultBrandId?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const price = String(f.get("price") ?? "").replace(/[,\s]/g, "");
    if (price && !/^\d+(\.\d{1,2})?$/.test(price)) return setError("Enter the price in shillings, e.g. 4750. Leave it empty for “price on request”.");
    setPending(true);
    const r = await callApi("/api/catalogue", "POST", {
      brandId: String(f.get("brandId")),
      name: String(f.get("name") ?? ""),
      description: String(f.get("description") ?? "") || undefined,
      sku: String(f.get("sku") ?? "") || undefined,
      category: String(f.get("category") ?? "") || undefined,
      priceCents: price ? Math.round(Number(price) * 100) : undefined,
      imageUrl: String(f.get("imageUrl") ?? "") || undefined,
    });
    setPending(false);
    if (!r.ok) {
      const issues = (r.error?.details as { issues?: Array<{ path: string; message: string }> } | undefined)?.issues;
      return setError(issues?.length ? issues.map((i) => `${i.path}: ${i.message}`).join(" ") : r.error?.message ?? "Not saved.");
    }
    router.push("/app/catalogue");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card max-w-2xl space-y-4 p-6">
      <div>
        <label className="label" htmlFor="name">
          Product or service
        </label>
        <input id="name" name="name" required maxLength={300} className="input" placeholder="e.g. Tari prepaid meter, single phase" autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="description">
          Description <span className="font-normal text-muted">(what customers should know)</span>
        </label>
        <textarea id="description" name="description" rows={3} maxLength={2000} className="input py-2" />
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
          <label className="label" htmlFor="price">
            Price, KES <span className="font-normal text-muted">(empty = on request)</span>
          </label>
          <input id="price" name="price" inputMode="decimal" className="input" placeholder="4750" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <input id="category" name="category" maxLength={100} className="input" placeholder="e.g. Meters" />
        </div>
        <div>
          <label className="label" htmlFor="sku">
            SKU
          </label>
          <input id="sku" name="sku" maxLength={100} className="input" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="imageUrl">
          Image link <span className="font-normal text-muted">(optional)</span>
        </label>
        <input id="imageUrl" name="imageUrl" type="url" maxLength={500} className="input" placeholder="https://" />
      </div>
      {error ? (
        <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Saving…" : "Add product"}
        </button>
        <button type="button" onClick={() => router.push("/app/catalogue")} className="btn-ghost">
          Cancel
        </button>
      </div>
    </form>
  );
}
