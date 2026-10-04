"use client";

import { ImagePlus, LoaderIcon, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";
import { INPUT_IMAGE_HELP, INPUT_IMAGE_LIMITS } from "@/lib/generation-models";
import { fromCents, parseAmountToCents } from "@/lib/money";

export interface ProductFormValues {
  id?: string;
  brandId: string;
  name: string;
  sku: string;
  description: string;
  price: string;
  category: string;
  unit: string;
  url: string;
  details: Array<{ name: string; value: string }>;
  trackStock: boolean;
  stockQty: string;
  lowStockAt: string;
  archived?: boolean;
  images: Array<{ id: string; url: string }>;
}

export function emptyProduct(brandId: string): ProductFormValues {
  return { brandId, name: "", sku: "", description: "", price: "", category: "", unit: "", url: "", details: [], trackStock: false, stockQty: "0", lowStockAt: "", images: [] };
}

export function priceText(cents: number | null): string {
  return cents === null ? "" : String(fromCents(cents));
}

async function postFiles(url: string, files: File[]): Promise<string | null> {
  const form = new FormData();
  files.forEach((f) => form.append("file", f));
  try {
    const res = await fetch(url, { method: "POST", body: form, credentials: "same-origin" });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
    return res.ok && json?.ok ? null : (json?.error?.message ?? "The upload did not go through.");
  } catch {
    return "No connection. Check your internet and try again.";
  }
}

/**
 * Create or edit a product: details, price, optional stock tracking and pictures.
 * Pictures are uploaded after the product is saved, so a failed upload never loses the text.
 */
export function ProductForm({ initial, brands }: { initial: ProductFormValues; brands: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  const [picked, setPicked] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const creating = !v.id;

  async function save(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFields({});
    setNotice(null);
    const price = parseAmountToCents(v.price);
    if (price === undefined) return setFields({ priceCents: "Enter the price as a number, like 1500 or 1,500.50." });
    const attributes = Object.fromEntries(v.details.filter((d) => d.name.trim() && d.value.trim()).map((d) => [d.name.trim(), d.value.trim()]));
    const body: Record<string, unknown> = {
      brandId: v.brandId,
      name: v.name,
      sku: v.sku,
      description: v.description,
      priceCents: price,
      category: v.category,
      unit: v.unit,
      url: v.url,
      attributes,
      trackStock: v.trackStock,
      lowStockAt: v.trackStock && v.lowStockAt.trim() !== "" ? Number(v.lowStockAt) : null,
    };
    if (creating && v.trackStock) body.stockQty = Math.max(0, Math.floor(Number(v.stockQty) || 0));
    setBusy("save");
    const res = creating
      ? await callApi<{ item: { id: string } }>("/api/products", { method: "POST", body: JSON.stringify(body) })
      : await callApi<{ item: { id: string } }>(`/api/products/${v.id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (res.error) {
      setBusy(null);
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    const id = res.data!.item.id;
    if (picked.length > 0) {
      const problem = await postFiles(`/api/products/${id}/images`, picked);
      if (problem) {
        setBusy(null);
        setError(`The product was saved, but ${problem}`);
        if (creating) router.replace(`/app/products/${id}`);
        return;
      }
    }
    setBusy(null);
    if (creating) {
      router.push(`/app/products/${id}`);
      return;
    }
    setPicked([]);
    if (fileRef.current) fileRef.current.value = "";
    setNotice("Saved.");
    router.refresh();
  }

  async function removeImage(imageId: string) {
    setBusy(imageId);
    const res = await callApi(`/api/products/${v.id}/images/${imageId}`, { method: "DELETE" });
    setBusy(null);
    if (res.error) setError(res.error);
    else {
      setV((s) => ({ ...s, images: s.images.filter((i) => i.id !== imageId) }));
      router.refresh();
    }
  }

  async function toggleArchive() {
    setBusy("archive");
    const res = await callApi(`/api/products/${v.id}`, { method: "PATCH", body: JSON.stringify({ archived: !v.archived }) });
    setBusy(null);
    if (res.error) setError(res.error);
    else router.push("/app/products");
  }

  const err = (k: string) => (fields[k] ? <p className="mt-1 text-xs text-danger" role="alert">{fields[k]}</p> : null);

  return (
    <form method="post" className="card space-y-5 p-5" onSubmit={(e) => void save(e)} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-name">Product name</label>
          <input id="p-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Smoked beef sausage, 500 g" />
          {err("name")}
        </div>
        <div>
          <label className="label" htmlFor="p-brand">Brand</label>
          <select id="p-brand" className="input" value={v.brandId} onChange={(e) => setV({ ...v, brandId: e.target.value })}>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {err("brandId")}
        </div>
        <div>
          <label className="label" htmlFor="p-price">Price, KES <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-price" className="input" inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} placeholder="e.g. 750" />
          {err("priceCents")}
        </div>
        <div>
          <label className="label" htmlFor="p-category">Category <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-category" className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} placeholder="e.g. Meats" />
        </div>
        <div>
          <label className="label" htmlFor="p-sku">SKU <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-sku" className="input" value={v.sku} onChange={(e) => setV({ ...v, sku: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="p-desc">Description</label>
          <textarea id="p-desc" className="input min-h-[96px] py-2" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={2000} placeholder="What it is, who it is for, what makes it good. The AI only quotes what you write here." />
          {err("description")}
        </div>
        <div>
          <label className="label" htmlFor="p-unit">Sold by <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-unit" className="input" value={v.unit} onChange={(e) => setV({ ...v, unit: e.target.value })} placeholder="piece, kg, box…" />
        </div>
        <div>
          <label className="label" htmlFor="p-url">Link <span className="font-normal text-muted">(optional)</span></label>
          <input id="p-url" className="input" inputMode="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" />
          {err("url")}
        </div>
      </div>

      <div>
        <p className="label">More details <span className="font-normal text-muted">(size, colour, ingredients…)</span></p>
        <ul className="space-y-2">
          {v.details.map((d, i) => (
            <li key={i} className="flex gap-2">
              <input aria-label="Detail name" className="input w-2/5" value={d.name} placeholder="Name" onChange={(e) => setV({ ...v, details: v.details.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <input aria-label="Detail value" className="input flex-1" value={d.value} placeholder="Value" onChange={(e) => setV({ ...v, details: v.details.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
              <button type="button" className="btn-quiet px-2" aria-label="Remove detail" onClick={() => setV({ ...v, details: v.details.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        {v.details.length < 20 && (
          <button type="button" className="btn-quiet mt-2" onClick={() => setV({ ...v, details: [...v.details, { name: "", value: "" }] })}>
            <Plus className="h-4 w-4" /> Add a detail
          </button>
        )}
      </div>

      <div className="rounded-xl border border-line p-4">
        <label className="flex items-start gap-3">
          <input type="checkbox" className="mt-1 h-4 w-4" checked={v.trackStock} onChange={(e) => setV({ ...v, trackStock: e.target.checked })} />
          <span>
            <span className="font-medium text-ink">Keep count of stock</span>
            <span className="block text-sm text-muted">We tell you when it runs low, and Autopilot leaves it out while it is sold out.</span>
          </span>
        </label>
        {v.trackStock && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {creating && (
              <div>
                <label className="label" htmlFor="p-qty">How many do you have now?</label>
                <input id="p-qty" className="input" inputMode="numeric" value={v.stockQty} onChange={(e) => setV({ ...v, stockQty: e.target.value })} />
              </div>
            )}
            <div>
              <label className="label" htmlFor="p-low">Warn me when it falls to <span className="font-normal text-muted">(optional)</span></label>
              <input id="p-low" className="input" inputMode="numeric" value={v.lowStockAt} onChange={(e) => setV({ ...v, lowStockAt: e.target.value })} placeholder="e.g. 5" />
              {err("lowStockAt")}
            </div>
            {!creating && <p className="text-sm text-muted sm:col-span-2">Change the count itself in the Stock box on this page, so every change is recorded.</p>}
          </div>
        )}
      </div>

      <div>
        <p className="label">Pictures</p>
        {v.images.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {v.images.map((img) => (
              <li key={img.id} className="group relative overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={v.name} className="aspect-square w-full object-cover" loading="lazy" />
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                  aria-label="Remove picture"
                  disabled={busy !== null}
                  onClick={() => void removeImage(img.id)}
                >
                  {busy === img.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <label className="btn-quiet cursor-pointer">
          <ImagePlus className="h-4 w-4" />
          {picked.length > 0 ? `${picked.length} picture${picked.length === 1 ? "" : "s"} chosen` : "Choose pictures"}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => setPicked(Array.from(e.target.files ?? []))} />
        </label>
        <p className="mt-1 text-xs text-muted">
          {INPUT_IMAGE_HELP} At most {INPUT_IMAGE_LIMITS.perItem} per product. The first picture is the one a video can start from.
        </p>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === "save" && <LoaderIcon className="h-4 w-4 animate-spin" />}
          {creating ? "Add product" : "Save changes"}
        </button>
        {!creating && (
          <button type="button" className="btn-quiet ml-auto" disabled={busy !== null} onClick={() => void toggleArchive()}>
            {v.archived ? "Restore" : "Archive"}
          </button>
        )}
      </div>
    </form>
  );
}
