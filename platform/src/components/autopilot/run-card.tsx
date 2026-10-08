"use client";

import { LoaderIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/landing/order-events";
import type { RunView } from "@/server/autopilot";

const LABEL: Record<string, { text: string; cls: string }> = {
  AWAITING_APPROVAL: { text: "Waiting for you", cls: "bg-warning/15 text-warning" },
  SCHEDULED: { text: "Going out", cls: "bg-primary/15 text-primary" },
  PUBLISHED: { text: "Posted", cls: "bg-success/15 text-success" },
  POST_FAILED: { text: "Post failed", cls: "bg-danger/15 text-danger" },
  GENERATING: { text: "Making it", cls: "bg-wash/10 text-muted" },
  FINISHING: { text: "Almost ready", cls: "bg-wash/10 text-muted" },
  PLANNED: { text: "Starting", cls: "bg-wash/10 text-muted" },
  SKIPPED: { text: "Skipped", cls: "bg-wash/10 text-muted" },
  REJECTED: { text: "Not approved", cls: "bg-wash/10 text-muted" },
  FAILED: { text: "Did not work", cls: "bg-danger/15 text-danger" },
};

const when = new Intl.DateTimeFormat("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Nairobi" });

/** One occasion of an Autopilot: what was made, its caption, and (when it is waiting) Approve and Reject. */
export function RunCard({ run, title, canApprove }: { run: RunView; title?: string; canApprove: boolean }) {
  const router = useRouter();
  const [caption, setCaption] = useState(run.caption ?? "");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const waiting = run.status === "AWAITING_APPROVAL";
  const label = LABEL[run.status] ?? { text: run.status, cls: "bg-wash/10 text-muted" };
  const slotDate = run.slot.startsWith("manual-") ? new Date(run.createdAt) : new Date(run.slot);

  async function act(kind: "approve" | "reject") {
    setBusy(kind);
    setError(null);
    const res = await callApi(`/api/autopilot-runs/${run.id}/${kind}`, { method: "POST", body: JSON.stringify(kind === "approve" ? { caption: caption.trim() !== (run.caption ?? "") ? caption : undefined } : {}) });
    setBusy(null);
    if (res.error) setError(res.error);
    else router.refresh();
  }

  return (
    <article className="card overflow-hidden" aria-label={title ?? "Autopilot post"}>
      {run.media && (
        run.media.type === "VIDEO" ? (
          <video src={run.media.url} controls playsInline preload="metadata" className="max-h-80 w-full bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={run.media.url} alt="" className="max-h-80 w-full bg-black object-contain" loading="lazy" />
        )
      )}
      <div className="space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-ink">{title ?? when.format(slotDate)}</p>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${label.cls}`}>{label.text}</span>
        </div>
        {title && <p className="text-xs text-muted">{when.format(slotDate)}</p>}
        {waiting && canApprove ? (
          <>
            <label className="sr-only" htmlFor={`cap-${run.id}`}>Caption</label>
            <textarea id={`cap-${run.id}`} className="input min-h-[96px] py-2" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2200} />
            <p className="text-xs text-muted">Goes to {run.posts.map((p) => p.channel).join(", ") || "your accounts"} when you approve.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn-primary" disabled={busy !== null || caption.trim().length === 0} onClick={() => void act("approve")}>
                {busy === "approve" && <LoaderIcon className="h-4 w-4 animate-spin" />} Approve and post
              </button>
              <button type="button" className="btn-quiet" disabled={busy !== null} onClick={() => void act("reject")}>
                {busy === "reject" && <LoaderIcon className="h-4 w-4 animate-spin" />} Don&apos;t post
              </button>
            </div>
          </>
        ) : (
          <>
            {run.caption && <p className="whitespace-pre-wrap text-ink/80">{run.caption}</p>}
            {run.reason && run.status !== "AWAITING_APPROVAL" && <p className="text-muted">{run.reason}</p>}
            {run.posts.length > 0 && (
              <ul className="text-xs text-muted">
                {run.posts.map((p) => (
                  <li key={p.id}>{p.channel}: {p.status.toLowerCase()}{p.error ? ` (${p.error})` : ""}</li>
                ))}
              </ul>
            )}
            {waiting && !canApprove && <p className="text-muted">Someone with approval rights needs to look at this one.</p>}
          </>
        )}
        {run.creditsSpent > 0 && <p className="text-xs text-muted">{run.creditsSpent} credits</p>}
        {error && <p className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-danger" role="alert">{error}</p>}
      </div>
    </article>
  );
}