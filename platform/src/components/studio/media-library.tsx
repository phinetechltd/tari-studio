"use client";

import { Clapperboard, Download, ImageIcon, LoaderIcon, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { callApi } from "@/components/landing/order-events";
import { cn } from "@/lib/utils";

import type { AssetView } from "./types";

type Filter = "ALL" | "VIDEO" | "IMAGE";

/** Every generated image and video in the organisation, newest first. */
export function MediaLibrary({ initial }: { initial: AssetView[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (f: Filter, query: string) => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "48" });
    if (f !== "ALL") params.set("mediaType", f);
    if (query) params.set("q", query);
    const r = await callApi<AssetView[]>(`/api/content/assets?${params}`);
    setLoading(false);
    if (r.error) setError(r.error);
    else setItems(r.data!);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(filter, q.trim()), 250);
    return () => clearTimeout(t);
  }, [filter, q, load]);

  // Keep running generations fresh.
  useEffect(() => {
    if (!items.some((a) => a.status === "GENERATING")) return;
    const t = setInterval(() => {
      if (!document.hidden) void load(filter, q.trim());
    }, 8000);
    return () => clearInterval(t);
  }, [items, filter, q, load]);

  const remove = async (id: string) => {
    setConfirmId(null);
    const r = await callApi<{ archived: boolean; reason?: string }>(`/api/content/assets/${id}`, { method: "DELETE" });
    if (r.error) setError(r.error);
    else if (!r.data!.archived) setError(r.data!.reason ?? "Could not remove it yet.");
    else setItems((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-raised p-0.5 text-sm shadow-sm ring-1 ring-line" role="group" aria-label="Filter by type">
          {(["ALL", "VIDEO", "IMAGE"] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={cn("min-h-[36px] rounded-md px-3", filter === f ? "bg-primary text-onprimary" : "text-muted hover:text-ink")}
            >
              {f === "ALL" ? "All" : f === "VIDEO" ? "Videos" : "Images"}
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <label className="sr-only" htmlFor="lib-search">Search prompts</label>
          <input id="lib-search" className="input pl-9" placeholder="Search prompts" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {loading && <LoaderIcon className="h-4 w-4 animate-spin text-muted" aria-label="Loading" />}
      </div>

      {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{error}</p>}

      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line px-6 py-12 text-center">
          <p className="font-medium text-ink">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted">
            Generations from the <Link href="/content" className="text-primary underline">Video Studio</Link> appear here.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((a) => (
            <li key={a.id} className="card overflow-hidden">
              <Link href={`/content/assets/${a.id}`} className="block bg-neutral-950">
                {a.status === "READY" && a.fileUrl ? (
                  a.mediaType === "VIDEO" ? (
                    <video src={a.fileUrl} muted playsInline preload="metadata" className="aspect-video w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.fileUrl} alt={a.prompt} loading="lazy" className="aspect-video w-full object-cover" />
                  )
                ) : (
                  <div className="flex aspect-video items-center justify-center text-sm text-ink/60">
                    {a.status === "GENERATING" ? (
                      <span className="inline-flex items-center gap-2"><LoaderIcon className="h-4 w-4 animate-spin" /> Generating…</span>
                    ) : (
                      "Failed"
                    )}
                  </div>
                )}
              </Link>
              <div className="p-3">
                <p className="line-clamp-2 text-sm text-ink">{a.prompt}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                  {a.mediaType === "VIDEO" ? <Clapperboard className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />}
                  <span>
                    {a.mediaType === "VIDEO" ? `${a.durationSeconds ?? "?"} s` : "Image"}
                    {a.aspectRatio ? ` · ${a.aspectRatio}` : ""} · {new Date(a.createdAt).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {a.status === "READY" && a.fileUrl && (
                      <a href={`${a.fileUrl}?download=1`} className="rounded-md p-2 hover:bg-surface hover:text-ink" aria-label="Download">
                        <Download className="h-4 w-4" />
                      </a>
                    )}
                    {a.status !== "GENERATING" && (
                      <button type="button" className="rounded-md p-2 hover:bg-surface hover:text-danger" aria-label="Remove from library" onClick={() => setConfirmId(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </div>
                {confirmId === a.id && (
                  <div role="alertdialog" aria-label="Remove from library" className="mt-3 rounded-lg border border-line bg-surface p-3 text-xs">
                    <p className="text-ink">Remove from the library? It stays in the token history.</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="btn-primary min-h-[32px] px-3 text-xs" onClick={() => void remove(a.id)}>Remove</button>
                      <button type="button" className="btn-quiet min-h-[32px] px-3 text-xs" onClick={() => setConfirmId(null)}>Keep</button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
