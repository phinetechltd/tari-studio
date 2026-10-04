"use client";

import { FileText, ImagePlus, LoaderIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";
import { INPUT_IMAGE_HELP } from "@/lib/generation-models";

export interface BrandMediaProps {
  brandId: string;
  hasCover: boolean;
  hasLogo: boolean;
  /** Changes whenever the picture changes, so the browser does not show the old one */
  version: number;
  attachments: Array<{ id: string; kind: "IMAGE" | "DOCUMENT"; label: string; fileName: string; size: number; url: string }>;
  maxAttachments: number;
}

async function send(url: string, files: File[]): Promise<string | null> {
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

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Cover picture, logo and the files kept with a brand. Each change is saved as soon as it is made. */
export function BrandMedia({ brandId, hasCover, hasLogo, version, attachments, maxAttachments }: BrandMediaProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(slot: "cover" | "logo" | "attachments", files: File[]) {
    if (files.length === 0) return;
    setBusy(slot);
    setError(null);
    const problem = await send(`/api/brands/${brandId}/${slot}`, files);
    setBusy(null);
    if (problem) setError(problem);
    else router.refresh();
  }

  async function remove(path: string, key: string) {
    setBusy(key);
    setError(null);
    const res = await callApi(path, { method: "DELETE" });
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  const slot = (name: "cover" | "logo", title: string, has: boolean, ratio: string, hint: string) => (
    <div>
      <p className="label">{title}</p>
      <div className={`relative overflow-hidden rounded-xl border border-line bg-surface ${ratio}`}>
        {has ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/brands/${brandId}/${name}?v=${version}`} alt={title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center p-3 text-center text-sm text-muted">{hint}</div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="btn-quiet cursor-pointer">
          {busy === name ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
          {has ? "Replace" : "Upload"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy !== null} onChange={(e) => void upload(name, Array.from(e.target.files ?? [])).then(() => (e.target.value = ""))} />
        </label>
        {has && (
          <button type="button" className="btn-quiet" disabled={busy !== null} onClick={() => void remove(`/api/brands/${brandId}/${name}`, `rm-${name}`)}>
            {busy === `rm-${name}` ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="card mt-6 max-w-2xl space-y-6 p-6" aria-labelledby="brand-media">
      <div>
        <h2 id="brand-media" className="text-lg font-semibold text-ink">Pictures and files</h2>
        <p className="text-sm text-muted">A cover picture and logo make content look like the brand, and Autopilot needs the cover. {INPUT_IMAGE_HELP}</p>
      </div>
      <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
        {slot("cover", "Cover picture", hasCover, "aspect-video", "A wide picture that shows the brand at its best")}
        {slot("logo", "Logo", hasLogo, "aspect-square", "Square logo")}
      </div>

      <div>
        <p className="label">Other files <span className="font-normal text-muted">({attachments.length} of {maxAttachments})</span></p>
        {attachments.length > 0 && (
          <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
            {attachments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                {a.kind === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" className="h-10 w-10 rounded object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded bg-surface text-muted"><FileText className="h-5 w-5" /></span>
                )}
                <a href={a.url} className="min-w-0 flex-1 truncate text-ink hover:underline" {...(a.kind === "DOCUMENT" ? { download: a.fileName } : { target: "_blank", rel: "noreferrer" })}>
                  {a.fileName}
                </a>
                <span className="text-xs text-muted">{kb(a.size)}</span>
                <button type="button" className="btn-quiet px-2" aria-label={`Remove ${a.fileName}`} disabled={busy !== null} onClick={() => void remove(`/api/brands/${brandId}/attachments/${a.id}`, a.id)}>
                  {busy === a.id ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        {attachments.length < maxAttachments && (
          <label className="btn-quiet cursor-pointer">
            {busy === "attachments" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} Add files
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,.pdf,.docx,.xlsx,.pptx"
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => void upload("attachments", Array.from(e.target.files ?? [])).then(() => (e.target.value = ""))}
            />
          </label>
        )}
        <p className="mt-1 text-xs text-muted">Pictures, or PDF, Word, Excel and PowerPoint files up to 10 MB each (style guide, price list…).</p>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
