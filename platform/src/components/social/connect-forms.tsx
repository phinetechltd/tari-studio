"use client";

import { MessageCircle, Music2, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { callApi } from "@/components/json-form";
import { CopyButton } from "@/components/campaigns/campaign-controls";

export function ConnectForms(props: {
  brands: Array<{ id: string; name: string }>;
  defaultBrandId?: string;
  simulated: boolean;
  webhookUrl: string;
  webhookReady: boolean;
  /** "live" | "simulator" | "off" (Settings → TikTok) */
  tiktokMode?: string;
}) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(props.defaultBrandId ?? (props.brands.length === 1 ? props.brands[0]!.id : ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="card max-w-md p-4">
        <label htmlFor="brand" className="label">
          Brand
        </label>
        <select id="brand" value={brandId} onChange={(e) => setBrandId(e.target.value)} className="input">
          <option value="" disabled>
            Choose the brand these accounts belong to
          </option>
          {props.brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-6" aria-labelledby="fb">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1877F2]/20 text-[#6ea8ff]">
            <Share2 className="h-5 w-5" />
          </span>
          <h2 id="fb" className="mt-4 text-lg font-semibold">
            Facebook Page and Instagram
          </h2>
          <p className="mt-1 text-sm text-muted">
            Sign in with Facebook and choose the Pages to share. Each Page&apos;s linked Instagram business account is connected with it.
            Tokens are encrypted and never shown again.
          </p>
          <a
            href={brandId ? `/api/channels/meta/start?brandId=${encodeURIComponent(brandId)}` : undefined}
            aria-disabled={!brandId}
            className={`btn-primary mt-5 ${brandId ? "" : "pointer-events-none opacity-50"}`}
          >
            {props.simulated ? "Connect a simulated Page" : "Continue with Facebook"}
          </a>
          {props.simulated ? <p className="mt-2 text-xs text-muted">Simulator: returns a test Page and Instagram account without leaving the app.</p> : null}
        </section>

        <section className="panel p-6" aria-labelledby="wa">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#25D366]/20 text-[#5DF3D7]">
            <MessageCircle className="h-5 w-5" />
          </span>
          <h2 id="wa" className="mt-4 text-lg font-semibold">
            WhatsApp Business number
          </h2>
          <p className="mt-1 text-sm text-muted">
            From Meta&apos;s WhatsApp Manager, copy the <b>Phone number ID</b> and a permanent <b>System User token</b> with
            whatsapp_business_messaging. The token is checked against the number before it is saved.
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!brandId) return setError("Choose the brand first.");
              const f = new FormData(e.currentTarget);
              setPending(true);
              setError(null);
              const r = await callApi("/api/channels/whatsapp", "POST", {
                brandId,
                phoneNumberId: String(f.get("phoneNumberId") ?? "").trim(),
                businessAccountId: String(f.get("businessAccountId") ?? "").trim() || undefined,
                accessToken: String(f.get("accessToken") ?? "").trim(),
                name: String(f.get("name") ?? "").trim() || undefined,
              });
              setPending(false);
              if (!r.ok) {
                const issues = (r.error?.details as { issues?: Array<{ message: string }> } | undefined)?.issues;
                return setError(issues?.length ? issues.map((i) => i.message).join(" ") : r.error?.message ?? "Not connected.");
              }
              router.push("/app/social?connect=ok&count=1");
              router.refresh();
            }}
          >
            <input name="name" className="input" placeholder="Name shown in the inbox, e.g. Tari Sales" maxLength={120} aria-label="Display name" />
            <input
              name="phoneNumberId"
              required
              className="input"
              placeholder="Phone number ID"
              defaultValue={props.simulated ? `sim-${(props.defaultBrandId ?? props.brands[0]?.id ?? "number").slice(-10)}` : undefined}
              aria-label="Phone number ID"
            />
            <input name="businessAccountId" className="input" placeholder="WhatsApp Business Account ID (optional)" aria-label="WhatsApp Business Account ID" />
            <input
              name="accessToken"
              required
              type="password"
              autoComplete="off"
              className="input"
              placeholder="Permanent access token"
              defaultValue={props.simulated ? "simulated-token-not-a-secret" : undefined}
              aria-label="Access token"
            />
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <button type="submit" disabled={pending || !brandId} className="btn-primary w-full">
              {pending ? "Checking with Meta…" : "Connect number"}
            </button>
          </form>
          <div className="mt-5 rounded-xl border border-wash/[0.08] bg-black/30 p-3 text-xs text-muted">
            <p className="font-medium text-ink">Webhook for incoming messages</p>
            <p className="mt-1">In your Meta app → WhatsApp → Configuration, set this callback URL and subscribe to “messages”:</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-wash/[0.06] px-2 py-1 text-ink">{props.webhookUrl}</code>
              <CopyButton value={props.webhookUrl} />
            </div>
            <p className="mt-2">
              {props.webhookReady
                ? "The verify token is the META_WEBHOOK_VERIFY_TOKEN value on the server."
                : "The server still needs META_APP_SECRET and META_WEBHOOK_VERIFY_TOKEN before Meta can deliver messages."}
            </p>
          </div>
        </section>

        {props.tiktokMode && props.tiktokMode !== "off" ? (
          <section className="panel p-6 lg:col-span-2" aria-labelledby="tt">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-ink">
              <Music2 className="h-5 w-5" />
            </span>
            <h2 id="tt" className="mt-4 text-lg font-semibold">
              TikTok
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Sign in with TikTok to post videos and pictures from your Library. After connecting, you can also switch on automatic comment replies for a TikTok Business account.
              Tokens are encrypted and never shown again.
            </p>
            <a
              href={brandId ? `/api/channels/tiktok/start?brandId=${encodeURIComponent(brandId)}` : undefined}
              aria-disabled={!brandId}
              className={`btn-primary mt-5 ${brandId ? "" : "pointer-events-none opacity-50"}`}
            >
              {props.tiktokMode === "simulator" ? "Connect a simulated TikTok account" : "Continue with TikTok"}
            </a>
            {props.tiktokMode === "simulator" ? (
              <p className="mt-2 text-xs text-muted">Simulator: connects a test account and pretends to post, without leaving the app.</p>
            ) : (
              <p className="mt-2 text-xs text-muted">Until TikTok audits this app, posts can only be seen by the account owner (&quot;Only me&quot;).</p>
            )}
          </section>
        ) : null}
      </div>
    </div>
  );
}
