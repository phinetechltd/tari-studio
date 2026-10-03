"use client";

import { ImagePlus, LoaderIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";

export interface TemplateValues {
  id?: string;
  title: string;
  description: string;
  category: string;
  promptHint: string;
  status: "DRAFT" | "PUBLISHED";
  images: Array<{ id: string; url: string; caption: string | null }>;
}

/** Create or edit a template: its text, its state, and its image pack. */
export function TemplateEditor({ initial }: { initial: TemplateValues }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const creating = !v.id;

  const set = <K extends keyof TemplateValues>(k: K, val: TemplateValues[K]) => setV((s) => ({ ...s, [k]: val }));
  const err = (k: string) => (fields[k] ? <p className="mt-1 text-xs text-danger" role="alert">{fields[k]}</p> : null);

  async function save(e: FormEvent, status?: "DRAFT" | "PUBLISHED") {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setFields({});
    setNotice(null);
    const body = {
      title: v.title,
      description: v.description,
      category: v.category || null,
      promptHint: v.promptHint || null,
      status: status ?? v.status,
    };
    const res = creating
      ? await callApi<{ id: string }>("/api/platform/templates", { method: "POST", body: JSON.stringify({ ...body, status: "DRAFT" }) })
      : await callApi<{ id: string }>(`/api/platform/templates/${v.id}`, { method: "PATCH", body: JSON.stringify(body) });
    setBusy(null);
    if (res.error) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    if (creating) {
      router.push(`/platform/templates/${res.data!.id}`);
      return;
    }
    if (status) set("status", status);
    setNotice(status === "PUBLISHED" ? "Published. Every agency can use it now." : status === "DRAFT" ? "Unpublished." : "Saved.");
    router.refresh();
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0 || !v.id) return;
    setBusy("upload");
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("file", f));
    try {
      const res = await fetch(`/api/platform/templates/${v.id}/images`, { method: "POST", body: form, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (!res.ok || !json?.ok) setError(json?.error?.message ?? "The upload did not go through.");
      else router.refresh();
    } catch {
      setError("No connection. Check your internet and try again.");
    }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(null);
  }

  async function removeImage(imageId: string) {
    setBusy(imageId);
    setError(null);
    const res = await callApi(`/api/platform/templates/${v.id}/images/${imageId}`, { method: "DELETE" });
    setBusy(null);
    if (res.error) setError(res.error);
    else {
      set("images", v.images.filter((i) => i.id !== imageId));
      router.refresh();
    }
  }

  async function removeTemplate() {
    if (!window.confirm("Delete this template and its images? Agencies will no longer see it.")) return;
    setBusy("delete");
    const res = await callApi(`/api/platform/templates/${v.id}`, { method: "DELETE" });
    setBusy(null);
    if (res.error) setError(res.error);
    else router.push("/platform/templates");
  }

  return (
    <div className="space-y-6">
      <form className="card space-y-5 p-5" onSubmit={(e) => void save(e)} noValidate>
        <div>
          <label className="label" htmlFor="t-title">Title</label>
          <input id="t-title" className="input" value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Market day, fresh produce" />
          {err("title")}
        </div>
        <div>
          <label className="label" htmlFor="t-desc">Description</label>
          <textarea id="t-desc" className="input min-h-[120px] py-2" value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="What the look is, who it suits, how to use the pack." />
          {err("description")}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="t-cat">Category <span className="font-normal text-muted">(optional)</span></label>
            <input id="t-cat" className="input" value={v.category} onChange={(e) => set("category", e.target.value)} placeholder="Food, Fashion, Real estate…" />
          </div>
          <div>
            <label className="label" htmlFor="t-hint">Prompt hint <span className="font-normal text-muted">(optional)</span></label>
            <input id="t-hint" className="input" value={v.promptHint} onChange={(e) => set("promptHint", e.target.value)} placeholder="Warm golden light, bustling market, candid" />
            {err("promptHint")}
          </div>
        </div>
        <p className="text-xs text-muted">
          When an agency uses this template, the prompt hint (or the description if there is no hint) goes in front of what they type.
        </p>

        {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
        {notice && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="btn-primary" disabled={busy !== null}>
            {busy === "save" && <LoaderIcon className="h-4 w-4 animate-spin" />}
            {creating ? "Create template" : "Save changes"}
          </button>
          {!creating && v.status === "DRAFT" && (
            <button type="button" className="btn-quiet" disabled={busy !== null} onClick={(e) => void save(e, "PUBLISHED")}>
              Publish to all agencies
            </button>
          )}
          {!creating && v.status === "PUBLISHED" && (
            <button type="button" className="btn-quiet" disabled={busy !== null} onClick={(e) => void save(e, "DRAFT")}>
              Unpublish
            </button>
          )}
          {!creating && (
            <button type="button" className="btn-danger ml-auto" disabled={busy !== null} onClick={() => void removeTemplate()}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          )}
        </div>
      </form>

      {creating ? (
        <p className="text-sm text-muted">Create the template first, then add its image pack.</p>
      ) : (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-ink">Image pack ({v.images.length})</h2>
            <label className="btn-quiet cursor-pointer">
              {busy === "upload" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
              Add images
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" disabled={busy !== null} onChange={(e) => void upload(e.target.files)} />
            </label>
          </div>
          <p className="mt-1 text-xs text-muted">PNG, JPEG or WebP, up to 10 MB each. The first image is the cover.</p>
          {v.images.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No images yet. A template needs at least one before it can be published.</p>
          ) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {v.images.map((img, i) => (
                <li key={img.id} className="group relative overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.caption ?? `Pack image ${i + 1}`} className="aspect-square w-full object-cover" loading="lazy" />
                  {i === 0 && <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">Cover</span>}
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                    aria-label="Remove image"
                    disabled={busy !== null}
                    onClick={() => void removeImage(img.id)}
                  >
                    {busy === img.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
