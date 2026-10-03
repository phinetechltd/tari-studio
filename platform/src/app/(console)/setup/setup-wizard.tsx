"use client";

import { ArrowRight, Check, CircleDashed, PartyPopper, SkipForward, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { cn } from "@/lib/utils";

export interface WizardStep {
  key: string;
  title: string;
  description: string;
  href: string;
  action: string;
  done: boolean;
  skipped: boolean;
}

/**
 * The getting-started steps, one at a time: the first unfinished step is open,
 * the rest are a checklist. Each step links to the real page; coming back
 * here shows it ticked, because "done" is read from what exists.
 */
export function SetupWizard({ steps, canEdit, dismissed }: { steps: WizardStep[]; canEdit: boolean; dismissed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const current = steps.find((s) => !s.done && !s.skipped) ?? null;
  const finished = steps.filter((s) => s.done).length;
  const pct = Math.round((finished / Math.max(1, steps.length)) * 100);

  async function patch(body: unknown, key: string) {
    setBusy(key);
    setError(null);
    const r = await callApi("/api/setup", "PATCH", body);
    setBusy(null);
    if (!r.ok) return setError(r.error?.message ?? "Could not save.");
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">
              {finished} of {steps.length} done
            </span>
            <span className="text-muted">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Setup progress">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>

        {current ? (
          <section className="card mt-4 p-6" aria-labelledby="current-step">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Step {steps.indexOf(current) + 1} of {steps.length}
            </p>
            <h2 id="current-step" className="mt-2 text-xl font-semibold">
              {current.title}
            </h2>
            <p className="mt-2 max-w-xl text-muted">{current.description}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={current.href} className="btn-primary">
                {current.action} <ArrowRight className="h-4 w-4" />
              </Link>
              {canEdit ? (
                <button type="button" disabled={busy !== null} onClick={() => patch({ skip: current.key }, current.key)} className="btn-quiet">
                  <SkipForward className="h-4 w-4" /> {busy === current.key ? "Skipping…" : "Skip for now"}
                </button>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="card mt-4 p-6 text-center" aria-labelledby="all-done">
            <PartyPopper className="mx-auto h-8 w-8 text-primary" aria-hidden />
            <h2 id="all-done" className="mt-3 text-xl font-semibold">
              You&apos;re set up
            </h2>
            <p className="mt-2 text-muted">Everything on the list is done or skipped. Skipped steps stay below for later.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/content" className="btn-primary">
                Open the Studio
              </Link>
              <Link href="/app" className="btn-quiet">
                Go to Home
              </Link>
            </div>
          </section>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-300">
            {error}
          </p>
        ) : null}
      </div>

      <aside aria-label="All steps">
        <ol className="card divide-y divide-white/[0.06] overflow-hidden">
          {steps.map((s, i) => (
            <li key={s.key} className={cn("flex items-start gap-3 px-4 py-3", s === current ? "bg-primary/[0.06]" : "")}>
              <span
                className={cn(
                  "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  s.done ? "bg-primary text-onprimary" : "border border-white/15 text-muted",
                )}
                aria-hidden
              >
                {s.done ? <Check className="h-3.5 w-3.5" /> : s.skipped ? <CircleDashed className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link href={s.href} className={cn("text-sm font-medium hover:underline", s.done ? "text-muted line-through decoration-white/30" : "text-ink")}>
                  {s.title}
                </Link>
                <span className="sr-only">{s.done ? " (done)" : s.skipped ? " (skipped)" : ""}</span>
                {s.skipped && canEdit ? (
                  <button type="button" disabled={busy !== null} onClick={() => patch({ unskip: s.key }, `un-${s.key}`)} className="mt-1 flex items-center gap-1 text-xs text-primary hover:underline">
                    <Undo2 className="h-3 w-3" /> Do it now
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {canEdit ? (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => patch({ dismissed: !dismissed }, "dismiss")}
            className="mt-3 w-full rounded-full px-3 py-2 text-sm text-muted hover:bg-white/[0.06] hover:text-ink"
          >
            {dismissed ? "Show the checklist on Home again" : "Hide the checklist from Home"}
          </button>
        ) : null}
      </aside>
    </div>
  );
}
