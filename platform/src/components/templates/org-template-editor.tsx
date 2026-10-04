"use client";

import { ExternalLink, Globe2, ImagePlus, LoaderIcon, Lock, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import { PinterestPicker, type PinChoice } from "@/components/pinterest/pinterest-picker";
import { cn } from "@/lib/utils";

export interface OrgTemplateValues {
  id: string;
  title: string;
  description: string;
  category: string;
  promptHint: string;
  status: "DRAFT" | "PUBLISHED";
  visibility: "PRIVATE" | "PUBLIC";
  hidden: boolean;
  hiddenReason: string | null;
  images: Array<{ id: string; url: string; caption: string | null; source: { url: string | null; author: string | null; authorUrl: string | null; owned: boolean } | null }>;
}

/**
 * An organisation's own template: its words, who can see it, and its image
 * pack (uploads and Pinterest pins). Public means every organisation on the
 * platform can use it once published; it needs images that are yours to share.
 */
export function OrgTemplateEditor({ initial }: { initial: OrgTemplateValues }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const othersPins = v.images.filter((i) => i.source && !i.source.owned).length;
  const set = <K extends keyof OrgTemplateValues>(k: K, val: OrgTemplateValues[K]) => setV((s) => ({ ...s, [k]: val }));

  async function save(e: FormEvent | null, patch: Partial<Pick<OrgTemplateValues, "status" | "visibility">> = {}) {
    e?.preventDefault();
    setBusy("save");
    setError(null);
    setNotice(null);
    const r = await callApi(`/api/templates/${v.id}`, "PATCH", {
      title: v.title,
      description: v.description,
      category: v.category || null,
      promptHint: v.promptHint || null,
      status: patch.status ?? v.status,
      visibility: patch.visibility ?? v.visibility,
    });
    setBusy(null);
    if (!r.ok) return setError(r.error?.message ?? "Could not save.");
    setV((s) => ({ ...s, ...patch }));
    const next = { status: patch.status ?? v.status, visibility: patch.visibility ?? v.visibility };
    setNotice(
      next.status === "PUBLISHED"
        ? next.visibility === "PUBLIC"
          ? "Published for every organisation on the platform."
          : "Published for your team. It is in the Studio's template list now."
        : "Saved as a draft.",
    );
    router.refresh();
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy("upload");
    setError(null);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("file", f));
    try {
      const res = await fetch(`/api/templates/${v.id}/images`, { method: "POST", body: form, credentials: "same-origin" });
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
    setBusy(`rm-${imageId}`);
    setError(null);
    const r = await callApi(`/api/templates/${v.id}/images/${imageId}`, "DELETE");
    setBusy(null);
    if (!r.ok) return setError(r.error?.message ?? "Could not remove the image.");
    setV((s) => ({ ...s, images: s.images.filter((i) => i.id !== imageId) }));
    router.refresh();
  }

  async function importPins(pins: PinChoice[]): Promise<string | null> {
    const r = await callApi<{ added: string[] }>(`/api/templates/${v.id}/pinterest`, "POST", { pins });
    if (!r.ok) return r.error?.message ?? "The pins could not be imported.";
    router.refresh();
    return null;
  }

  async function remove() {
    if (!window.confirm(`Delete "${v.title}" and its images? This cannot be undone.`)) return;
    setBusy("delete");
    const r = await callApi(`/api/templates/${v.id}`, "DELETE");
    setBusy(null);
    if (!r.ok) return setError(r.error?.message ?? "Could not delete.");
    router.push("/app/templates");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <form onSubmit={(e) => void save(e)} className="card h-fit space-y-4 p-5">
        {v.hidden ? (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">
            A platform admin took this template out of the shared list{v.hiddenReason ? `: ${v.hiddenReason}` : "."} Your team can still use it.
          </p>
        ) : null}
        <div>
          <label className="label" htmlFor="t-title">Title</label>
          <input id="t-title" required minLength={3} maxLength={120} value={v.title} onChange={(e) => set("title", e.target.value)} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="t-desc">What it is for</label>
          <textarea id="t-desc" required minLength={10} maxLength={4000} rows={4} value={v.description} onChange={(e) => set("description", e.target.value)} className="input py-2.5" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="t-cat">Category</label>
            <input id="t-cat" maxLength={60} value={v.category} onChange={(e) => set("category", e.target.value)} className="input" placeholder="e.g. Launch, Food, Fashion" />
          </div>
        </div>
        <div>
          <label className="label" htmlFor="t-hint">Added to every prompt (optional)</label>
          <textarea id="t-hint" maxLength={600} rows={3} value={v.promptHint} onChange={(e) => set("promptHint", e.target.value)} className="input py-2.5" placeholder="e.g. Warm natural light, bold headline at the top, brand colours" />
        </div>

        <fieldset>
          <legend className="label">Who can use it</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(["PRIVATE", "PUBLIC"] as const).map((vis) => (
              <label key={vis} className={cn("flex cursor-pointer gap-3 rounded-xl border p-3 text-sm", v.visibility === vis ? "border-primary bg-primary/10" : "border-line")}>
                <input type="radio" name="visibility" className="mt-1" checked={v.visibility === vis} onChange={() => set("visibility", vis)} />
                <span>
                  <span className="flex items-center gap-1.5 font-medium text-ink">
                    {vis === "PRIVATE" ? <Lock className="h-3.5 w-3.5" aria-hidden /> : <Globe2 className="h-3.5 w-3.5" aria-hidden />}
                    {vis === "PRIVATE" ? "Private" : "Public"}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{vis === "PRIVATE" ? "Only your organisation." : "Every organisation on the platform, once published."}</span>
                </span>
              </label>
            ))}
          </div>
          {v.visibility === "PUBLIC" && othersPins > 0 ? (
            <p className="mt-2 text-xs text-amber-200">
              {othersPins} image{othersPins === 1 ? " comes" : "s come"} from other people&apos;s Pinterest pins. Remove {othersPins === 1 ? "it" : "them"} before publishing this as public.
            </p>
          ) : null}
        </fieldset>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <button type="submit" disabled={busy !== null} className="btn-quiet">
            {busy === "save" ? "Saving…" : "Save"}
          </button>
          {v.status === "DRAFT" ? (
            <button type="button" disabled={busy !== null || v.images.length === 0} onClick={() => void save(null, { status: "PUBLISHED" })} className="btn-primary" title={v.images.length === 0 ? "Add at least one image first" : undefined}>
              Publish {v.visibility === "PUBLIC" ? "for everyone" : "for my team"}
            </button>
          ) : (
            <button type="button" disabled={busy !== null} onClick={() => void save(null, { status: "DRAFT" })} className="btn-quiet">
              Unpublish
            </button>
          )}
          <button type="button" disabled={busy !== null} onClick={() => void remove()} className="btn-ghost ml-auto text-red-300">
            <Trash2 className="h-4 w-4" /> Delete
          </button>
        </div>
        <p className="text-xs text-muted">
          Status: <span className="text-ink">{v.status === "PUBLISHED" ? "Published" : "Draft"}</span> · {v.visibility === "PUBLIC" ? "Public" : "Private"}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-sm text-success">
            {notice}
          </p>
        ) : null}
      </form>

      <div className="space-y-6">
        <section className="card p-5" aria-labelledby="pack">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 id="pack" className="font-semibold">
              Image pack ({v.images.length})
            </h2>
            <label className="btn-quiet cursor-pointer">
              {busy === "upload" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Upload images
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => void upload(e.target.files)} />
            </label>
          </div>
          {v.images.length === 0 ? (
            <p className="text-sm text-muted">No images yet. Upload your own, or bring some in from Pinterest below.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {v.images.map((img) => (
                <li key={img.id} className="overflow-hidden rounded-xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.caption ?? ""} className="aspect-square w-full object-cover" loading="lazy" />
                  <div className="flex items-start justify-between gap-2 p-2 text-xs">
                    <div className="min-w-0">
                      {img.caption ? <p className="line-clamp-1 text-ink">{img.caption}</p> : null}
                      {img.source ? (
                        <a href={img.source.url ?? undefined} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-muted hover:text-ink">
                          {img.source.owned ? "Your pin" : `Pin by ${img.source.author ?? "a Pinterest user"}`} <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <p className="text-muted">Uploaded</p>
                      )}
                    </div>
                    <button type="button" onClick={() => void removeImage(img.id)} disabled={busy !== null} className="shrink-0 rounded-full p-1 text-muted hover:bg-white/[0.06] hover:text-red-300" aria-label="Remove image">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5" aria-labelledby="pinterest">
          <h2 id="pinterest" className="font-semibold">
            Add from Pinterest
          </h2>
          <p className="mb-4 mt-1 text-sm text-muted">Search your own pins and boards, or paste the link of any public pin.</p>
          <PinterestPicker onImport={importPins} importLabel="Add to pack" onlyOwned={v.visibility === "PUBLIC" && v.status === "PUBLISHED"} back={`/app/templates/${v.id}/edit`} />
        </section>
      </div>
    </div>
  );
}
