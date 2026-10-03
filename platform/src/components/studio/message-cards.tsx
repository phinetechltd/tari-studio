"use client";

import { CircleX, Download, FastForward, LoaderIcon, Pencil, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";

import { formatKES } from "@/lib/money";
import { ASPECT_RATIOS, FAMILIES, modelCredits, secondsLabel, type CatalogueModel, type GenerationMode } from "@/lib/generation-models";
import { creditsToCents, VIDEO_MAX_SECONDS, VIDEO_MIN_SECONDS } from "@/lib/pricing";
import type { Pricing } from "@/lib/pricing";
import { costOf } from "@/lib/studio-intent";
import { cn } from "@/lib/utils";

import type { AssetView, Balances, MessageView, QuoteMeta } from "./types";

/** The Studio's message bubbles and cards. Drawn for the dark chat band. */

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-wash/[0.08] px-4 py-3 text-sm text-ink/90">
      {text}
    </div>
  );
}

export function AssistantText({ text }: { text: string }) {
  return (
    <div className="max-w-[92%] whitespace-pre-line rounded-2xl rounded-bl-sm border border-wash/[0.08] bg-wash/[0.03] px-4 py-3 text-sm text-ink/80">
      {text}
    </div>
  );
}

/** The models a customer can pick for a mode, the default first. */
export function modelsFor(models: CatalogueModel[], mode: GenerationMode): CatalogueModel[] {
  return models
    .filter((m) => m.enabled && m.endpoints[mode])
    .sort((a, b) => Number(b.defaultFor.includes(mode)) - Number(a.defaultFor.includes(mode)) || a.sortOrder - b.sortOrder);
}

/** Credits and shilling value of a quote on its model, matching what the server will charge. */
export function quoteCost(pricing: Pricing, models: CatalogueModel[], meta: Pick<QuoteMeta, "mode" | "seconds" | "modelKey">) {
  const options = modelsFor(models, meta.mode);
  const model = options.find((m) => m.key === meta.modelKey) ?? options[0];
  if (!model) return { ...costOf(pricing, { mode: meta.mode, seconds: meta.seconds }), model: null };
  try {
    const credits = modelCredits(pricing, model, meta.mode === "image" ? undefined : (meta.seconds ?? undefined));
    return { credits, cents: creditsToCents(pricing, credits), model };
  } catch {
    return { ...costOf(pricing, { mode: meta.mode, seconds: meta.seconds }), model };
  }
}

const MODE_LABEL: Record<QuoteMeta["mode"], string> = {
  image: "Image",
  video: "Video",
  animate: "Animate image",
  extend: "Extend clip",
};

export function QuoteCard({
  pricing,
  models,
  message,
  balances,
  onPatch,
  onGenerate,
  onBuy,
  producingOrder,
}: {
  pricing: Pricing;
  /** The enabled catalogue models (Platform admin → AI & credits) */
  models: CatalogueModel[];
  message: MessageView;
  balances: Balances | null;
  onPatch: (patch: Partial<Pick<QuoteMeta, "seconds" | "aspectRatio" | "prompt" | "mode" | "modelKey">>) => Promise<void>;
  onGenerate: () => Promise<void>;
  onBuy: (creditsShort: number) => void;
  producingOrder: string | null;
}) {
  const meta = message.meta!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(meta.prompt);
  const [seconds, setSeconds] = useState(meta.seconds ?? 10);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSeconds(meta.seconds ?? 10), [meta.seconds]);

  const isVideo = meta.mode !== "image";
  const options = modelsFor(models, meta.mode);
  const cost = quoteCost(pricing, models, { mode: meta.mode, seconds: isVideo ? seconds : null, modelKey: meta.modelKey });
  const family = cost.model ? FAMILIES[cost.model.family] : null;
  const rule = family?.seconds ?? { min: VIDEO_MIN_SECONDS, max: VIDEO_MAX_SECONDS };
  const range = "choices" in rule ? { min: VIDEO_MIN_SECONDS, max: VIDEO_MAX_SECONDS } : rule;
  const shapes = family?.aspects ?? (family ? null : ASPECT_RATIOS);
  const have = balances?.credits ?? 0;
  const short = balances !== null && !balances.unmetered && have < cost.credits;
  const derived = meta.mode === "animate" || meta.mode === "extend";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[92%] rounded-2xl rounded-bl-sm border border-wash/[0.1] bg-wash/[0.04] p-4 text-sm text-ink/80">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-ink/40">Quote</p>
        {!derived && (
          <div className="flex rounded-lg bg-wash/[0.06] p-0.5 text-xs" role="group" aria-label="Make an image or a video">
            {(["video", "image"] as const).map((m) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => void run(() => onPatch({ mode: m }))}
                className={cn(
                  "min-h-[32px] rounded-md px-3",
                  meta.mode === m ? "bg-white text-neutral-950" : "text-ink/60 hover:text-white",
                )}
                aria-pressed={meta.mode === m}
              >
                {m === "video" ? "Video" : "Image"}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-ink/90">{message.body}</p>

      {editing ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor={`prompt-${message.id}`}>Prompt</label>
          <textarea
            id={`prompt-${message.id}`}
            className="min-h-[88px] w-full rounded-lg border border-wash/10 bg-black/30 p-3 text-sm text-ink/90 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="min-h-[36px] rounded-lg bg-white px-3 text-xs font-medium text-neutral-950"
              disabled={busy || draft.trim().length < 3}
              onClick={() => void run(async () => {
                await onPatch({ prompt: draft });
                setEditing(false);
              })}
            >
              Save prompt
            </button>
            <button type="button" className="min-h-[36px] rounded-lg px-3 text-xs text-ink/60" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-2 text-ink/60">
          &ldquo;{meta.prompt}&rdquo;{" "}
          <button type="button" className="inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" /> Edit
          </button>
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.length > 0 && (
          <div className="sm:col-span-2">
            <label className="text-xs text-ink/50" htmlFor={`model-${message.id}`}>Model</label>
            {options.length > 1 ? (
              <select
                id={`model-${message.id}`}
                value={cost.model?.key ?? ""}
                disabled={busy}
                onChange={(e) => void run(() => onPatch({ modelKey: e.target.value }))}
                className="mt-1 min-h-[36px] w-full rounded-lg border border-wash/10 bg-wash/[0.06] px-2 text-sm text-ink"
              >
                {options.map((m) => (
                  <option key={m.key} value={m.key} className="bg-neutral-900">
                    {m.label}
                    {m.description ? ` · ${m.description}` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p id={`model-${message.id}`} className="mt-1 text-sm text-ink/80">
                {options[0]!.label}
                {options[0]!.description ? <span className="text-ink/50"> · {options[0]!.description}</span> : null}
              </p>
            )}
          </div>
        )}
        {isVideo && "choices" in rule ? (
          <div>
            <p className="text-xs text-ink/50" id={`secs-${message.id}`}>Length</p>
            <div className="mt-1 flex gap-1" role="group" aria-labelledby={`secs-${message.id}`}>
              {rule.choices.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={busy}
                  aria-pressed={seconds === c}
                  onClick={() => c !== meta.seconds && void run(() => onPatch({ seconds: c }))}
                  className={cn("min-h-[36px] rounded-lg px-3 text-sm", seconds === c ? "bg-white text-neutral-950" : "bg-wash/[0.06] text-ink/70 hover:text-white")}
                >
                  {c} s
                </button>
              ))}
            </div>
          </div>
        ) : isVideo ? (
          <div>
            <label className="text-xs text-ink/50" htmlFor={`secs-${message.id}`}>
              Length: <span className="font-medium text-ink">{seconds} s</span>
              {family ? <span className="text-ink/40"> ({secondsLabel(rule)})</span> : null}
            </label>
            <input
              id={`secs-${message.id}`}
              type="range"
              min={range.min}
              max={range.max}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              onPointerUp={() => seconds !== meta.seconds && void run(() => onPatch({ seconds }))}
              onKeyUp={() => seconds !== meta.seconds && void run(() => onPatch({ seconds }))}
              className="w-full accent-violet-400"
            />
          </div>
        ) : null}
        {meta.mode !== "animate" && meta.mode !== "extend" && (
          <div>
            <label className="text-xs text-ink/50" htmlFor={`ar-${message.id}`}>Shape</label>
            {shapes ? (
              <select
                id={`ar-${message.id}`}
                value={meta.aspectRatio}
                disabled={busy}
                onChange={(e) => void run(() => onPatch({ aspectRatio: e.target.value }))}
                className="mt-1 min-h-[36px] w-full rounded-lg border border-wash/10 bg-wash/[0.06] px-2 text-sm text-ink"
              >
                {shapes.map((r) => (
                  <option key={r} value={r} className="bg-neutral-900">
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <p id={`ar-${message.id}`} className="mt-1 text-sm text-ink/60">Set by the model</p>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-violet-500/20 px-3 py-1 text-xs text-violet-200">
          {cost.credits} credits
        </span>
        <span className="rounded-full bg-wash/[0.08] px-3 py-1 text-xs text-ink/80">{formatKES(cost.cents)} value</span>
        {balances?.unmetered && <span className="text-xs text-ink/40">Not charged on your plan</span>}
        {producingOrder && <span className="text-xs text-amber-200">For order {producingOrder}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {short ? (
          <button
            type="button"
            onClick={() => onBuy(cost.credits - have)}
            className="min-h-[40px] rounded-lg bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-wash/90"
          >
            Top up {cost.credits - have} more credits to generate
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(onGenerate)}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-4 text-sm font-medium text-neutral-950 hover:bg-wash/90 disabled:opacity-60"
          >
            {busy ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate
          </button>
        )}
        {derived && <span className="self-center text-xs text-ink/40">{MODE_LABEL[meta.mode]}</span>}
      </div>
    </div>
  );
}

function useElapsed(since: string, active: boolean): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  const s = Math.max(0, Math.round((now - new Date(since).getTime()) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

export function GenerationCard({
  asset,
  onDerive,
  onAgain,
  onMediaLoaded,
}: {
  asset: AssetView;
  onDerive: (mode: "animate" | "extend") => Promise<void>;
  onAgain: () => Promise<void>;
  onMediaLoaded?: () => void;
}) {
  const elapsed = useElapsed(asset.createdAt, asset.status === "GENERATING");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const isVideo = asset.mediaType === "VIDEO";

  return (
    <div className="max-w-[92%] overflow-hidden rounded-2xl rounded-bl-sm border border-wash/[0.1] bg-wash/[0.04] text-sm text-ink/80">
      {asset.status === "GENERATING" && (
        <div className="flex aspect-video items-center justify-center bg-gradient-to-br from-violet-500/10 via-transparent to-indigo-500/10">
          <div className="text-center" role="status">
            <LoaderIcon className="mx-auto h-6 w-6 animate-spin text-ink/70" />
            <p className="mt-3 text-ink/80">Generating {isVideo ? `a ${asset.durationSeconds ?? ""}-second video` : "an image"}…</p>
            <p className="mt-1 text-xs text-ink/40">{elapsed} so far. {isVideo ? "Videos take a few minutes." : ""} You can leave this page.</p>
          </div>
        </div>
      )}

      {asset.status === "READY" && asset.fileUrl && (
        isVideo ? (
          <video
            src={asset.fileUrl}
            controls
            playsInline
            preload="metadata"
            onLoadedMetadata={onMediaLoaded}
            className="max-h-[60vh] w-full bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.fileUrl} alt={asset.prompt} onLoad={onMediaLoaded} className="max-h-[60vh] w-full bg-black object-contain" />
        )
      )}

      {asset.status === "FAILED" && (
        <div className="flex items-start gap-3 p-4">
          <CircleX className="mt-0.5 h-5 w-5 shrink-0 text-red-300" />
          <div>
            <p className="text-ink/90">This one did not work.</p>
            <p className="mt-1 text-ink/60">{asset.error ?? "The generation failed."}</p>
            {asset.tokensCharged > 0 && <p className="mt-1 text-xs text-ink/40">Its credits were returned to your wallet.</p>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-wash/[0.06] p-3">
        <span className="mr-auto line-clamp-1 text-xs text-ink/40">
          {isVideo ? `${asset.durationSeconds ?? "?"} s video` : "Image"}
          {asset.aspectRatio ? `, ${asset.aspectRatio}` : ""}
          {asset.tokensCharged > 0 ? `, ${asset.tokensCharged} credits` : ""}
        </span>
        {asset.status === "READY" && asset.fileUrl && (
          <a
            href={`${asset.fileUrl}?download=1`}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs text-ink/80 hover:bg-wash/[0.06]"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        )}
        {asset.status === "READY" && asset.canDerive && !isVideo && (
          <button type="button" disabled={busy} onClick={() => void run(() => onDerive("animate"))} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs text-ink/80 hover:bg-wash/[0.06]">
            <Wand2 className="h-3.5 w-3.5" /> Animate
          </button>
        )}
        {asset.status === "READY" && asset.canDerive && isVideo && (
          <button type="button" disabled={busy} onClick={() => void run(() => onDerive("extend"))} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs text-ink/80 hover:bg-wash/[0.06]">
            <FastForward className="h-3.5 w-3.5" /> Extend
          </button>
        )}
        {asset.status !== "GENERATING" && (
          <button type="button" disabled={busy} onClick={() => void run(onAgain)} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs text-ink/80 hover:bg-wash/[0.06]">
            <RotateCcw className="h-3.5 w-3.5" /> {asset.status === "FAILED" ? "Try again" : "Another take"}
          </button>
        )}
      </div>
    </div>
  );
}
