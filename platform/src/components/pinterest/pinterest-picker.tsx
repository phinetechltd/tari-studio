"use client";

import { Check, ExternalLink, Link2, LoaderIcon, Search, SquareStack } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { callApi } from "@/components/json-form";
import type { PinResult } from "@/lib/pinterest";
import { cn } from "@/lib/utils";

/**
 * Finds Pinterest pins to use as template images. What it offers depends on
 * the deployment (Settings → Pinterest): the organisation's own pins and
 * boards once it connects its Pinterest account, all of Pinterest when the app
 * has partner search, and always a pasted link to any public pin.
 *
 * Someone else's pin is credited and stays private: with `onlyOwned` (a public
 * template) only the organisation's own pins can be chosen.
 */

export interface PinChoice {
  id: string;
  source: PinResult["source"];
  link?: string;
  title?: string;
  description?: string | null;
  imageUrl?: string;
  author?: string | null;
  authorUrl?: string | null;
}

interface Status {
  features: { account: boolean; partnerSearch: boolean; simulated: boolean };
  account: { name: string; handle: string | null } | null;
}

type Tab = "own" | "boards" | "partner" | "link";

const toChoice = (p: PinResult): PinChoice =>
  p.source === "own" || p.source === "board"
    ? { id: p.id, source: p.source }
    : { id: p.id, source: p.source, link: p.link, title: p.title, description: p.description, imageUrl: p.imageUrl, author: p.author, authorUrl: p.authorUrl };

export function PinterestPicker({
  onImport,
  importLabel = "Import",
  max = 12,
  onlyOwned = false,
  back,
}: {
  /** Receives the chosen pins; throw (or return an error string) to show a problem */
  onImport: (pins: PinChoice[]) => Promise<string | null>;
  importLabel?: string;
  max?: number;
  onlyOwned?: boolean;
  /** Where to come back to after connecting Pinterest */
  back: string;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [tab, setTab] = useState<Tab>("link");
  const [query, setQuery] = useState("");
  const [link, setLink] = useState("");
  const [pins, setPins] = useState<PinResult[]>([]);
  const [boards, setBoards] = useState<Array<{ id: string; name: string; pinCount: number; cover: string | null }> | null>(null);
  const [selected, setSelected] = useState<Map<string, PinResult>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void callApi<Status>("/api/pinterest", "GET").then((r) => {
      if (!r.ok || !r.data) return setError(r.error?.message ?? "Pinterest is not available.");
      setStatus(r.data);
      if (r.data.account) setTab("own");
    });
  }, []);

  const connected = Boolean(status?.account);
  const tabs: Array<{ id: Tab; label: string; show: boolean }> = [
    { id: "own", label: "My pins", show: Boolean(status?.features.account) },
    { id: "boards", label: "My boards", show: Boolean(status?.features.account) },
    { id: "partner", label: "Search Pinterest", show: Boolean(status?.features.partnerSearch) },
    { id: "link", label: "Paste a link", show: true },
  ];

  async function search(source: "own" | "partner" | "board", q: string, board?: string) {
    setBusy("search");
    setError(null);
    const params = new URLSearchParams({ source, q, ...(board ? { board } : {}) });
    const r = await callApi<{ pins: PinResult[] }>(`/api/pinterest/search?${params}`, "GET");
    setBusy(null);
    if (!r.ok || !r.data) return setError(r.error?.message ?? "Pinterest did not answer.");
    setPins(r.data.pins);
    if (r.data.pins.length === 0) setError("No pins found.");
  }

  async function loadBoards() {
    setBusy("boards");
    setError(null);
    const r = await callApi<{ boards: NonNullable<typeof boards> }>("/api/pinterest/boards", "GET");
    setBusy(null);
    if (!r.ok || !r.data) return setError(r.error?.message ?? "Could not load your boards.");
    setBoards(r.data.boards);
    setPins([]);
  }

  async function addLink(e: FormEvent) {
    e.preventDefault();
    if (!link.trim()) return;
    setBusy("link");
    setError(null);
    const r = await callApi<{ pin: PinResult }>("/api/pinterest/link", "POST", { url: link.trim() });
    setBusy(null);
    if (!r.ok || !r.data) return setError(r.error?.message ?? "That link did not work.");
    const pin = r.data.pin;
    setPins((list) => [pin, ...list.filter((p) => p.id !== pin.id)]);
    if (!onlyOwned || pin.owned) setSelected((s) => new Map(s).set(pin.id, pin));
    setLink("");
  }

  function toggle(p: PinResult) {
    if (onlyOwned && !p.owned) return;
    setSelected((s) => {
      const next = new Map(s);
      if (next.has(p.id)) next.delete(p.id);
      else if (next.size < max) next.set(p.id, p);
      return next;
    });
  }

  async function importSelected() {
    if (selected.size === 0) return;
    setBusy("import");
    setError(null);
    setDone(null);
    let problem: string | null = null;
    try {
      problem = await onImport([...selected.values()].map(toChoice));
    } catch (e) {
      problem = e instanceof Error ? e.message : String(e);
    }
    setBusy(null);
    if (problem) return setError(problem);
    setDone(`Imported ${selected.size} pin${selected.size === 1 ? "" : "s"}.`);
    setSelected(new Map());
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Where to find pins">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setPins([]);
                setError(null);
                if (t.id === "boards" && connected && boards === null) void loadBoards();
              }}
              className={cn("min-h-[34px] rounded-full border px-3 text-xs", tab === t.id ? "border-primary bg-primary/15 text-ink" : "border-line text-muted hover:text-ink")}
            >
              {t.label}
            </button>
          ))}
        {status?.account ? (
          <span className="ml-auto text-xs text-muted">
            Connected as <span className="text-ink">{status.account.handle ? `@${status.account.handle}` : status.account.name}</span>
            {status.features.simulated ? " (simulated)" : ""}
          </span>
        ) : null}
      </div>

      {(tab === "own" || tab === "boards" || tab === "partner") && status?.features.account && !connected ? (
        <div className="rounded-xl border border-line p-4 text-sm">
          <p className="text-ink">Connect your Pinterest account to search your own pins and boards.</p>
          <p className="mt-1 text-xs text-muted">Only read access is asked for: your boards, pins and profile.</p>
          <a href={`/api/pinterest/start?back=${encodeURIComponent(back)}`} className="btn-primary mt-3 inline-flex">
            Connect Pinterest
          </a>
        </div>
      ) : null}

      {(tab === "own" || tab === "partner") && connected ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (query.trim()) void search(tab === "partner" ? "partner" : "own", query.trim());
          }}
        >
          <label className="sr-only" htmlFor="pin-search">
            Search {tab === "partner" ? "Pinterest" : "your pins"}
          </label>
          <input id="pin-search" value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100} className="input flex-1" placeholder={tab === "partner" ? "e.g. sneaker launch poster" : "Search your pins"} />
          <button type="submit" disabled={busy !== null} className="btn-quiet">
            {busy === "search" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </button>
        </form>
      ) : null}

      {tab === "boards" && connected ? (
        boards === null ? (
          <p className="text-sm text-muted">{busy === "boards" ? "Loading your boards…" : ""}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {boards.map((b) => (
              <li key={b.id}>
                <button type="button" onClick={() => void search("board", "", b.id)} className="flex min-h-[36px] items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-xs text-muted hover:text-ink">
                  {b.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover} alt="" className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <SquareStack className="ml-1 h-4 w-4" aria-hidden />
                  )}
                  {b.name} <span className="text-muted">({b.pinCount})</span>
                </button>
              </li>
            ))}
            {boards.length === 0 ? <li className="text-sm text-muted">No boards on this account.</li> : null}
          </ul>
        )
      ) : null}

      {tab === "link" ? (
        <form className="flex gap-2" onSubmit={addLink}>
          <label className="sr-only" htmlFor="pin-link">
            Pinterest pin link
          </label>
          <input id="pin-link" value={link} onChange={(e) => setLink(e.target.value)} className="input flex-1" placeholder="https://www.pinterest.com/pin/123456789/ or a pin.it link" inputMode="url" />
          <button type="submit" disabled={busy !== null} className="btn-quiet">
            {busy === "link" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Add
          </button>
        </form>
      ) : null}

      {onlyOwned ? <p className="text-xs text-amber-200">This template is public, so only pins from your own Pinterest account can be added.</p> : null}

      {pins.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {pins.map((p) => {
            const on = selected.has(p.id);
            const blocked = onlyOwned && !p.owned;
            return (
              <li key={`${p.source}-${p.id}`} className={cn("overflow-hidden rounded-xl border", on ? "border-primary" : "border-line", blocked && "opacity-50")}>
                <button
                  type="button"
                  onClick={() => toggle(p)}
                  disabled={blocked}
                  aria-pressed={on}
                  aria-label={`${on ? "Unselect" : "Select"} ${p.title}`}
                  title={blocked ? "Public templates can only use your own pins" : p.title}
                  className="relative block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl} alt="" className="aspect-[3/4] w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                  {on ? (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-onprimary">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                </button>
                <div className="p-2 text-xs">
                  <p className="line-clamp-1 font-medium text-ink">{p.title}</p>
                  <p className="mt-0.5 flex items-center justify-between gap-1 text-muted">
                    <span className="truncate">{p.owned ? "Your pin" : p.author ? `By ${p.author}` : "Pinterest"}</span>
                    <a href={p.link} target="_blank" rel="noreferrer noopener" className="shrink-0 hover:text-ink" aria-label={`Open ${p.title} on Pinterest`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void importSelected()} disabled={selected.size === 0 || busy !== null} className="btn-primary">
          {busy === "import" ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
          {importLabel} {selected.size ? `(${selected.size})` : ""}
        </button>
        <p className="text-xs text-muted">
          Each image keeps a credit link to its pin. Pictures from other people&apos;s pins are style references: they keep a template private and are never used as a video&apos;s first frame.
        </p>
      </div>
    </div>
  );
}
