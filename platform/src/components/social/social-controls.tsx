"use client";

import { CalendarClock, ImageIcon, RefreshCw, Send, Sparkles, Unplug, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { callApi } from "@/components/json-form";
import { cn } from "@/lib/utils";

export function ChannelActions({ channelId, canDisconnect }: { channelId: string; canDisconnect: boolean }) {
  const router = useRouter();
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, setPending] = useState<"test" | "disconnect" | null>(null);
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending !== null}
          onClick={async () => {
            setPending("test");
            const r = await callApi<{ ok: boolean; detail: string }>(`/api/channels/${channelId}/test`, "POST");
            setPending(null);
            setNote(r.ok && r.data ? { ok: r.data.ok, text: r.data.detail } : { ok: false, text: r.error?.message ?? "Test failed." });
            router.refresh();
          }}
          className="btn-quiet min-h-[30px] px-3 text-xs"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", pending === "test" && "animate-spin")} /> Test connection
        </button>
        {canDisconnect ? (
          <button
            type="button"
            disabled={pending !== null}
            onClick={async () => {
              if (!window.confirm("Disconnect this account? Its token is deleted and any scheduled posts to it are cancelled.")) return;
              setPending("disconnect");
              const r = await callApi(`/api/channels/${channelId}`, "DELETE");
              setPending(null);
              if (!r.ok) return setNote({ ok: false, text: r.error?.message ?? "Not disconnected." });
              router.refresh();
            }}
            className="btn-danger min-h-[30px] px-3 text-xs"
          >
            <Unplug className="h-3.5 w-3.5" /> Disconnect
          </button>
        ) : null}
      </div>
      {note ? <p className={cn("mt-2 text-xs", note.ok ? "text-success" : "text-danger")}>{note.text}</p> : null}
    </div>
  );
}

export function PostActions({ postId, status }: { postId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const act = async (action: "cancel" | "retry") => {
    setError(null);
    const r = await callApi(`/api/posts/${postId}`, "PATCH", { action });
    if (!r.ok) return setError(r.error?.message ?? "Not done.");
    router.refresh();
  };
  return (
    <span className="inline-flex items-center gap-1">
      {status === "FAILED" ? (
        <button type="button" onClick={() => void act("retry")} className="btn-quiet min-h-[28px] px-2.5 text-xs">
          Retry
        </button>
      ) : null}
      {status === "SCHEDULED" || status === "FAILED" ? (
        <button type="button" onClick={() => void act("cancel")} className="btn-ghost min-h-[28px] px-2 text-xs">
          Cancel
        </button>
      ) : null}
      {error ? <span className="text-[11px] text-danger">{error}</span> : null}
    </span>
  );
}

interface ComposerProps {
  channels: Array<{ id: string; name: string; platform: string; brandId: string; brandName: string }>;
  assets: Array<{ id: string; mediaType: string; prompt: string }>;
  campaigns: Array<{ id: string; name: string; brandId: string }>;
  canUseAi: boolean;
}

/** Nairobi wall-clock from a datetime-local input. */
function nairobiInstant(local: string): string | null {
  return local ? new Date(`${local}:00+03:00`).toISOString() : null;
}

export function Composer(props: ComposerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [brief, setBrief] = useState("");
  const [assetId, setAssetId] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [pending, setPending] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const chosen = props.channels.filter((c) => selected.includes(c.id));
  const brandId = chosen[0]?.brandId ?? props.channels[0]?.brandId ?? null;
  const needsMedia = chosen.some((c) => c.platform === "INSTAGRAM") && !assetId;
  const asset = props.assets.find((a) => a.id === assetId) ?? null;
  const campaigns = useMemo(() => props.campaigns.filter((c) => !brandId || c.brandId === brandId), [props.campaigns, brandId]);

  const draftWithAi = async () => {
    if (!brandId || !brief.trim()) return setMessage({ ok: false, text: "Pick a channel and describe the post first." });
    setDrafting(true);
    setMessage(null);
    const platform = chosen[0]?.platform === "INSTAGRAM" ? "INSTAGRAM" : "FACEBOOK";
    const r = await callApi<{ caption: string }>("/api/ai/caption", "POST", { brandId, platform, brief, link: link || null });
    setDrafting(false);
    if (!r.ok || !r.data) return setMessage({ ok: false, text: r.error?.message ?? "No caption came back." });
    setText(r.data.caption);
  };

  const submit = async () => {
    setMessage(null);
    if (selected.length === 0) return setMessage({ ok: false, text: "Choose at least one Page or account." });
    if (when === "later" && !at) return setMessage({ ok: false, text: "Choose when to publish." });
    setPending(true);
    const r = await callApi<{ posts: unknown[] }>("/api/posts", "POST", {
      channelIds: selected,
      text,
      assetId,
      link: link || null,
      campaignId: campaignId || null,
      scheduledAt: when === "later" ? nairobiInstant(at) : null,
    });
    setPending(false);
    if (!r.ok) return setMessage({ ok: false, text: r.error?.message ?? "Not scheduled." });
    setText("");
    setBrief("");
    setAssetId(null);
    setLink("");
    setSelected([]);
    setMessage({ ok: true, text: when === "now" ? "Queued. It goes out within a few seconds." : "Scheduled." });
    router.refresh();
  };

  if (props.channels.length === 0) return null;

  return (
    <section className="panel space-y-4 p-5" aria-labelledby="compose">
      <h2 id="compose" className="text-lg font-semibold">
        New post
      </h2>

      <fieldset>
        <legend className="label">Post to</legend>
        <div className="flex flex-wrap gap-2">
          {props.channels.map((c) => {
            const on = selected.includes(c.id);
            const otherBrand = chosen.length > 0 && chosen[0]!.brandId !== c.brandId;
            return (
              <button
                key={c.id}
                type="button"
                disabled={otherBrand && !on}
                onClick={() => setSelected((s) => (on ? s.filter((x) => x !== c.id) : [...s, c.id]))}
                aria-pressed={on}
                aria-label={`${c.platform === "INSTAGRAM" ? "Instagram" : "Facebook"}: ${c.name} (${c.brandName})`}
                title={otherBrand && !on ? "One brand per post" : c.brandName}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
                  on ? "border-primary bg-primary/15 text-ink" : "border-line text-ink/80 hover:bg-wash/[0.05]",
                )}
              >
                <span className={cn("mr-1.5 text-[10px] font-bold", c.platform === "INSTAGRAM" ? "text-[#ff7ab6]" : "text-[#6ea8ff]")}>
                  {c.platform === "INSTAGRAM" ? "IG" : "FB"}
                </span>
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {props.canUseAi ? (
        <div className="rounded-xl border border-wash/[0.08] bg-black/30 p-3">
          <label className="label" htmlFor="brief">
            Write it with AI <span className="font-normal text-muted">(uses the brand&apos;s catalogue for prices)</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input id="brief" value={brief} onChange={(e) => setBrief(e.target.value)} maxLength={1500} className="input flex-1" placeholder="e.g. Weekend offer on the 2-bedroom meter kit, for landlords in Ruiru" />
            <button type="button" onClick={() => void draftWithAi()} disabled={drafting} className="btn-quiet">
              <Sparkles className="h-4 w-4" /> {drafting ? "Writing…" : "Draft caption"}
            </button>
          </div>
        </div>
      ) : null}

      <div>
        <label className="label" htmlFor="caption">
          Caption
        </label>
        <textarea id="caption" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2200} className="input py-2.5" placeholder="What the post says" />
        <p className="mt-1 text-right text-[11px] text-muted">{text.length} / 2,200</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <span className="label">Image or video</span>
          {asset ? (
            <div className="flex items-center gap-3 rounded-xl border border-line p-2">
              {asset.mediaType === "VIDEO" ? (
                <video src={`/api/content/assets/${asset.id}/file`} className="h-14 w-14 rounded-lg object-cover" muted />
              ) : (
                <img src={`/api/content/assets/${asset.id}/file`} alt="" className="h-14 w-14 rounded-lg object-cover" />
              )}
              <span className="line-clamp-2 flex-1 text-xs text-muted">{asset.prompt}</span>
              <button type="button" onClick={() => setAssetId(null)} className="btn-ghost min-h-[30px] px-2" aria-label="Remove media">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setPickerOpen((o) => !o)} className={cn("btn-quiet w-full", needsMedia && "border-warning/60")}>
              <ImageIcon className="h-4 w-4" /> Choose from the library
            </button>
          )}
          {needsMedia ? <p className="mt-1 text-xs text-warning">Instagram needs an image or a video.</p> : null}
        </div>
        <div className="space-y-3">
          <div>
            <label className="label" htmlFor="link">
              Link <span className="font-normal text-muted">(Facebook only)</span>
            </label>
            <input id="link" type="url" value={link} onChange={(e) => setLink(e.target.value)} className="input" placeholder="A tracked link from a campaign works best" />
          </div>
          <div>
            <label className="label" htmlFor="campaign">
              Campaign
            </label>
            <select id="campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="input">
              <option value="">None</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {pickerOpen && !asset ? (
        props.assets.length === 0 ? (
          <p className="text-sm text-muted">Nothing in the library yet. Make an image or a video in the Studio first.</p>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 lg:grid-cols-6">
            {props.assets.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => {
                  setAssetId(a.id);
                  setPickerOpen(false);
                }}
                className="overflow-hidden rounded-lg border border-transparent hover:border-primary"
                title={a.prompt}
              >
                {a.mediaType === "VIDEO" ? (
                  <video src={`/api/content/assets/${a.id}/file`} className="aspect-square w-full object-cover" muted preload="metadata" />
                ) : (
                  <img src={`/api/content/assets/${a.id}/file`} alt={a.prompt} loading="lazy" className="aspect-square w-full object-cover" />
                )}
              </button>
            ))}
          </div>
        )
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="when" checked={when === "now"} onChange={() => setWhen("now")} /> Publish now
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="when" checked={when === "later"} onChange={() => setWhen("later")} /> Schedule
        </label>
        {when === "later" ? (
          <span className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted" />
            <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="input !min-h-[38px] !w-auto" aria-label="Publish at (Nairobi time)" />
          </span>
        ) : null}
      </div>

      {message ? (
        <p role={message.ok ? "status" : "alert"} className={cn("rounded-lg border px-3 py-2 text-sm", message.ok ? "border-success/40 bg-success/10 text-success" : "border-danger/40 bg-danger/10 text-danger")}>
          {message.text}
        </p>
      ) : null}
      <button type="button" onClick={() => void submit()} disabled={pending || needsMedia} className="btn-primary">
        <Send className="h-4 w-4" /> {pending ? "Working…" : when === "now" ? "Publish" : "Schedule"}
      </button>
    </section>
  );
}
