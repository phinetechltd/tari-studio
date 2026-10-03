"use client";

import { ImagePlus, LoaderIcon, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

import { callApi } from "@/components/landing/order-events";

export interface CharacterFormValues {
  id?: string;
  name: string;
  description: string;
  brandId: string;
  archived?: boolean;
  images: Array<{ id: string; url: string }>;
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
 * Create a character (name, how they look, images) or edit one. Images are
 * uploaded after the character exists, so a failed upload never loses the text.
 */
export function CharacterForm({ initial, brands }: { initial: CharacterFormValues; brands: Array<{ id: string; name: string }> }) {
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
    setBusy("save");
    setError(null);
    setFields({});
    setNotice(null);
    const body = { name: v.name, description: v.description, brandId: v.brandId || null };
    const res = creating
      ? await callApi<{ id: string }>("/api/characters", { method: "POST", body: JSON.stringify(body) })
      : await callApi<{ id: string }>(`/api/characters/${v.id}`, { method: "PATCH", body: JSON.stringify(body) });
    if (res.error) {
      setBusy(null);
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    const id = res.data!.id;
    if (picked.length > 0) {
      const problem = await postFiles(`/api/characters/${id}/images`, picked);
      if (problem) {
        setBusy(null);
        setError(`The character was saved, but ${problem}`);
        if (creating) router.replace(`/app/characters/${id}`);
        return;
      }
    }
    setBusy(null);
    if (creating) {
      router.push(`/app/characters/${id}`);
      return;
    }
    setPicked([]);
    if (fileRef.current) fileRef.current.value = "";
    setNotice("Saved.");
    router.refresh();
  }

  async function removeImage(imageId: string) {
    setBusy(imageId);
    const res = await callApi(`/api/characters/${v.id}/images/${imageId}`, { method: "DELETE" });
    setBusy(null);
    if (res.error) setError(res.error);
    else {
      setV((s) => ({ ...s, images: s.images.filter((i) => i.id !== imageId) }));
      router.refresh();
    }
  }

  async function toggleArchive() {
    setBusy("archive");
    const res = await callApi(`/api/characters/${v.id}`, { method: "PATCH", body: JSON.stringify({ archived: !v.archived }) });
    setBusy(null);
    if (res.error) setError(res.error);
    else router.push("/app/characters");
  }

  const err = (k: string) => (fields[k] ? <p className="mt-1 text-xs text-danger" role="alert">{fields[k]}</p> : null);

  return (
    <form className="card space-y-5 p-5" onSubmit={(e) => void save(e)} noValidate>
      <div>
        <label className="label" htmlFor="c-name">Name</label>
        <input id="c-name" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="e.g. Mama Wanjiru" />
        {err("name")}
      </div>
      <div>
        <label className="label" htmlFor="c-desc">How they look and act</label>
        <textarea
          id="c-desc"
          className="input min-h-[100px] py-2"
          value={v.description}
          onChange={(e) => setV({ ...v, description: e.target.value })}
          placeholder="A warm woman in her fifties, round glasses, a yellow headwrap, always laughing."
          maxLength={600}
        />
        <p className="mt-1 text-xs text-muted">This goes into the prompt whenever the character is used, so be specific.</p>
        {err("description")}
      </div>
      <div>
        <label className="label" htmlFor="c-brand">Brand <span className="font-normal text-muted">(optional)</span></label>
        <select id="c-brand" className="input" value={v.brandId} onChange={(e) => setV({ ...v, brandId: e.target.value })}>
          <option value="">Any brand</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="label">Images</p>
        {v.images.length > 0 && (
          <ul className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {v.images.map((img) => (
              <li key={img.id} className="group relative overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={`${v.name}`} className="aspect-square w-full object-cover" loading="lazy" />
                <button
                  type="button"
                  className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
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
        <label className="btn-quiet cursor-pointer">
          <ImagePlus className="h-4 w-4" />
          {picked.length > 0 ? `${picked.length} image${picked.length === 1 ? "" : "s"} chosen` : "Choose images"}
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="sr-only" onChange={(e) => setPicked(Array.from(e.target.files ?? []))} />
        </label>
        <p className="mt-1 text-xs text-muted">PNG, JPEG or WebP, up to 10 MB each, at most 6 per character. Front-on, well-lit photos work best.</p>
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}
      {notice && <p className="rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success" role="status">{notice}</p>}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn-primary" disabled={busy !== null}>
          {busy === "save" && <LoaderIcon className="h-4 w-4 animate-spin" />}
          {creating ? "Create character" : "Save changes"}
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
