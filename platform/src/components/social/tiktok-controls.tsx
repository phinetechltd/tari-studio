"use client";

import { LoaderIcon, MessageSquareReply } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { callApi } from "@/components/json-form";
import { PRIVACY_LABELS, type PrivacyLevel, type TikTokOptions } from "@/lib/tiktok";

/** Comment replies on a TikTok channel card: switch on (TikTok Business API sign-in) or off. */
export function TikTokCommentControls(props: { channelId: string; connected: boolean; handle: string | null; lastError: string | null; available: boolean; canConnect: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (!props.available && !props.connected) {
    return <p className="mt-2 text-xs text-muted">Comment replies need TikTok&apos;s Business API, which a platform admin can set up.</p>;
  }
  return (
    <div className="mt-3 rounded-xl border border-line p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <MessageSquareReply className="h-3.5 w-3.5" aria-hidden /> Comment replies {props.connected ? "on" : "off"}
      </p>
      <p className="mt-1 text-muted">
        {props.connected
          ? `New comments${props.handle ? ` on @${props.handle}` : ""} run your "Someone comments on a TikTok video" automations every few minutes.`
          : "Answer TikTok comments with automations (a set reply or AI using your catalogue). Needs a TikTok Business account."}
      </p>
      {props.lastError ? <p className="mt-1 text-red-300">Last check: {props.lastError}</p> : null}
      {props.canConnect ? (
        props.connected ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await callApi(`/api/channels/${props.channelId}/tiktok`, "DELETE");
              setBusy(false);
              router.refresh();
            }}
            className="btn-ghost mt-2 min-h-[30px] px-2.5 text-xs"
          >
            Turn off
          </button>
        ) : (
          <a href={`/api/channels/tiktok/business/start?channelId=${encodeURIComponent(props.channelId)}`} className="btn-quiet mt-2 inline-flex min-h-[30px] px-3 text-xs">
            Turn on comment replies
          </a>
        )
      ) : null}
    </div>
  );
}

interface Creator {
  username: string;
  nickname: string;
  avatarUrl: string | null;
  privacyOptions: PrivacyLevel[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoSeconds: number;
}

/**
 * The choices TikTok requires an app to show before posting: which account,
 * who can see it (no default: the person picks from the account's own
 * options), what viewers may do, and whether it promotes a brand.
 */
export function TikTokPostOptions({ channelId, value, onChange }: { channelId: string; value: Partial<TikTokOptions>; onChange: (v: Partial<TikTokOptions>) => void }) {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCreator(null);
    setError(null);
    void callApi<Creator>(`/api/channels/${channelId}/tiktok`, "GET").then((r) => {
      if (cancelled) return;
      if (!r.ok || !r.data) setError(r.error?.message ?? "TikTok did not answer.");
      else setCreator(r.data);
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (error) return <p className="text-sm text-red-300">TikTok: {error}</p>;
  if (!creator) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <LoaderIcon className="h-4 w-4 animate-spin" /> Asking TikTok for this account&apos;s posting options…
      </p>
    );
  }

  const toggle = (key: "allowComments" | "allowDuet" | "allowStitch", disabled: boolean, label: string) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "opacity-50" : ""}`}>
      <input type="checkbox" className="h-4 w-4 accent-violet-500" disabled={disabled} checked={!disabled && Boolean(value[key])} onChange={(e) => onChange({ ...value, [key]: e.target.checked })} />
      {label}
      {disabled ? <span className="text-xs text-muted">(off on this account)</span> : null}
    </label>
  );

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      <p className="flex items-center gap-2 text-sm">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={creator.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : null}
        Posting to TikTok as <span className="font-medium text-ink">{creator.nickname}</span>
        {creator.username ? <span className="text-muted">@{creator.username}</span> : null}
      </p>
      <div>
        <label className="label" htmlFor={`tt-privacy-${channelId}`}>
          Who can see it
        </label>
        <select
          id={`tt-privacy-${channelId}`}
          required
          value={value.privacyLevel ?? ""}
          onChange={(e) => onChange({ ...value, privacyLevel: (e.target.value || undefined) as PrivacyLevel | undefined })}
          className="input"
        >
          <option value="" disabled>
            Choose who can see this post
          </option>
          {creator.privacyOptions.map((o) => (
            <option key={o} value={o}>
              {PRIVACY_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="label">Let viewers</legend>
        {toggle("allowComments", creator.commentDisabled, "Comment")}
        {toggle("allowDuet", creator.duetDisabled, "Duet (videos)")}
        {toggle("allowStitch", creator.stitchDisabled, "Stitch (videos)")}
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="label">Does it promote a brand?</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-violet-500" checked={Boolean(value.yourBrand)} onChange={(e) => onChange({ ...value, yourBrand: e.target.checked })} />
          Your own brand (it will be labelled &quot;Promotional content&quot;)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-violet-500"
            disabled={value.privacyLevel === "SELF_ONLY"}
            checked={Boolean(value.brandedContent)}
            onChange={(e) => onChange({ ...value, brandedContent: e.target.checked })}
          />
          Someone else&apos;s brand, a paid partnership (&quot;Paid partnership&quot;)
        </label>
      </fieldset>
      <p className="text-xs text-muted">
        Labelled as AI-generated, as TikTok asks. Videos up to {creator.maxVideoSeconds} seconds on this account. By posting, you agree to TikTok&apos;s{" "}
        <a href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en" target="_blank" rel="noreferrer noopener" className="underline">
          Music Usage Confirmation
        </a>
        {value.brandedContent ? (
          <>
            {" "}and{" "}
            <a href="https://www.tiktok.com/legal/page/global/bc-policy/en" target="_blank" rel="noreferrer noopener" className="underline">
              Branded Content Policy
            </a>
          </>
        ) : null}
        .
      </p>
    </div>
  );
}
