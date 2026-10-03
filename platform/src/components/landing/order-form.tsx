"use client";

import { ArrowRight, Clapperboard, ImageIcon, LoaderIcon, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ASPECT_RATIOS } from "@/lib/generation-models";
import { formatKES } from "@/lib/money";
import {
  creditsToCents,
  EXTRAS,
  MAX_IMAGES_PER_ORDER,
  quoteCreditOrder,
  VIDEO_MAX_SECONDS,
  VIDEO_MIN_SECONDS,
  type Pricing,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";

import { callApi, ORDER_PREFILL_EVENT, type OrderPrefill } from "./order-events";

type Kind = "IMAGE" | "VIDEO" | "QUOTE";

const LAST_ORDER_KEY = "last-order-token";

const ASPECT_LABELS: Record<string, string> = {
  "1:1": "Square 1:1 (feed post)",
  "9:16": "Vertical 9:16 (Reels, TikTok, Status)",
  "16:9": "Wide 16:9 (YouTube, TV)",
  "3:4": "Portrait 3:4",
  "4:3": "Landscape 4:3",
};

export function OrderForm({ pricing }: { pricing: Pricing }) {
  const [kind, setKind] = useState<Kind>("IMAGE");
  const [images, setImages] = useState(1);
  const [seconds, setSeconds] = useState(10);
  const [aspectRatio, setAspectRatio] = useState<string>("1:1");
  const [brief, setBrief] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [referenceLink, setReferenceLink] = useState("");
  const [extras, setExtras] = useState<string[]>([]);
  const [website, setWebsite] = useState(""); // honeypot

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<{ number: string; token: string } | null>(null);
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setResumeToken(window.localStorage.getItem(LAST_ORDER_KEY));
    } catch {
      /* storage blocked; resuming is a convenience only */
    }
  }, []);

  // The calculator and the Studio demo pre-fill this form.
  useEffect(() => {
    const onPrefill = (e: Event) => {
      const d = (e as CustomEvent<OrderPrefill>).detail;
      setSent(null);
      setError(null);
      setKind(d.kind);
      if (d.images) setImages(Math.min(MAX_IMAGES_PER_ORDER, Math.max(1, d.images)));
      if (d.seconds) setSeconds(Math.min(VIDEO_MAX_SECONDS, Math.max(VIDEO_MIN_SECONDS, d.seconds)));
      if (d.aspectRatio && (ASPECT_RATIOS as readonly string[]).includes(d.aspectRatio)) setAspectRatio(d.aspectRatio);
      else setAspectRatio(d.kind === "VIDEO" ? "9:16" : "1:1");
      if (d.brief) setBrief(d.brief);
      setTimeout(() => briefRef.current?.focus({ preventScroll: true }), 400);
    };
    window.addEventListener(ORDER_PREFILL_EVENT, onPrefill);
    return () => window.removeEventListener(ORDER_PREFILL_EVENT, onPrefill);
  }, []);

  const quote = useMemo(() => {
    try {
      if (kind === "IMAGE") return quoteCreditOrder(pricing, { kind: "IMAGE", images });
      if (kind === "VIDEO") return quoteCreditOrder(pricing, { kind: "VIDEO", seconds });
    } catch {
      return null;
    }
    return null;
  }, [kind, images, seconds, pricing]);

  const chooseKind = (k: Kind) => {
    setKind(k);
    setFields({});
    setError(null);
    if (k === "VIDEO" && aspectRatio === "1:1") setAspectRatio("9:16");
    if (k === "IMAGE" && aspectRatio === "9:16") setAspectRatio("1:1");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setFields({});
    setSubmitting(true);

    const contact = {
      name,
      phone,
      email: email || undefined,
      business: business || undefined,
      website: website || undefined,
    };

    const payload =
      kind === "QUOTE"
        ? { ...contact, extras, brief }
        : kind === "IMAGE"
          ? { kind, images, aspectRatio, brief, extras, referenceLink: referenceLink || undefined, ...contact }
          : { kind, seconds, aspectRatio, brief, extras, referenceLink: referenceLink || undefined, ...contact };

    const res = await callApi<{ number: string; token: string }>(kind === "QUOTE" ? "/api/orders/quote" : "/api/orders", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (res.error) {
      setError(res.error);
      setFields(res.fields ?? {});
      return;
    }
    try {
      window.localStorage.setItem(LAST_ORDER_KEY, res.data!.token);
    } catch {
      /* ignore */
    }
    setSent({ number: res.data!.number, token: res.data!.token });
    // The result card is shorter than the form; bring it into view.
    requestAnimationFrame(() => document.getElementById("order")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const fieldError = (key: string) =>
    fields[key] ? (
      <p className="mt-1 text-xs text-danger" role="alert">
        {fields[key]}
      </p>
    ) : null;

  // ── after sending ─────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="card p-6 sm:p-8">
        <p className="text-sm font-medium text-muted">Request {sent.number}</p>
        <h3 className="mt-1 text-xl font-semibold text-ink">Request received. We will confirm your price.</h3>
        <p className="mt-2 text-sm text-muted">
          Thank you. The team reviews every request and sets the final price. Nothing has been charged. Once the price is ready you pay on your order page,
          by M-Pesa or card, and work starts.
        </p>
        <div className="mt-6 rounded-lg border border-line bg-surface p-4 text-sm">
          <p className="text-ink">Your private order page, for the price, payment, progress and downloads:</p>
          <Link href={`/order/${sent.token}`} className="mt-1 inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline">
            Open request {sent.number} <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="mt-2 text-xs text-muted">Bookmark it: the link is the only way to see this request.</p>
        </div>
        <button
          type="button"
          className="btn-quiet mt-4"
          onClick={() => {
            setSent(null);
            setBrief("");
          }}
        >
          Send another request
        </button>
      </div>
    );
  }

  // ── the form ──────────────────────────────────────────────────────────
  const tabs: Array<{ k: Kind; label: string; icon: ReactNode }> = [
    { k: "IMAGE", label: "Images", icon: <ImageIcon className="h-4 w-4" /> },
    { k: "VIDEO", label: "Video", icon: <Clapperboard className="h-4 w-4" /> },
    { k: "QUOTE", label: "Something else", icon: <MessageSquare className="h-4 w-4" /> },
  ];

  return (
    <form onSubmit={submit} className="card p-5 sm:p-8" noValidate>
      {resumeToken && (
        <p className="mb-5 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          Ordered before?{" "}
          <Link href={`/order/${resumeToken}`} className="font-medium text-primary underline-offset-4 hover:underline">
            Open your last order
          </Link>
        </p>
      )}

      <div role="tablist" aria-label="What would you like?" className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-1">
        {tabs.map((t) => (
          <button
            key={t.k}
            type="button"
            role="tab"
            aria-selected={kind === t.k}
            onClick={() => chooseKind(t.k)}
            className={cn(
              "flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-2 text-sm font-medium transition-colors",
              kind === t.k ? "bg-raised text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-5">
        {kind === "IMAGE" && (
          <div>
            <label className="label" htmlFor="o-images">
              How many images? <span className="font-normal text-muted">({pricing.imageCredits} credits, {formatKES(creditsToCents(pricing, pricing.imageCredits))} each)</span>
            </label>
            <div className="flex items-center gap-4">
              <input
                id="o-images"
                type="range"
                min={1}
                max={MAX_IMAGES_PER_ORDER}
                value={images}
                onChange={(e) => setImages(Number(e.target.value))}
                className="w-full accent-[rgb(var(--c-primary))]"
              />
              <span className="w-10 text-right text-lg font-semibold tabular-nums text-ink">{images}</span>
            </div>
          </div>
        )}

        {kind === "VIDEO" && (
          <div>
            <label className="label" htmlFor="o-seconds">
              Video length <span className="font-normal text-muted">({pricing.videoCreditsPerStep} credits per started {pricing.videoStepSeconds} seconds)</span>
            </label>
            <div className="flex items-center gap-4">
              <input
                id="o-seconds"
                type="range"
                min={VIDEO_MIN_SECONDS}
                max={VIDEO_MAX_SECONDS}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="w-full accent-[rgb(var(--c-primary))]"
              />
              <span className="w-14 text-right text-lg font-semibold tabular-nums text-ink">{seconds} s</span>
            </div>
          </div>
        )}

        {kind !== "QUOTE" && (
          <div>
            <label className="label" htmlFor="o-aspect">
              Shape
            </label>
            <select id="o-aspect" className="input" value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}>
              {ASPECT_RATIOS.map((r) => (
                <option key={r} value={r}>
                  {ASPECT_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
        )}

        {kind === "QUOTE" && (
          <fieldset>
            <legend className="label">What do you need?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXTRAS.map((x) => (
                <label
                  key={x.key}
                  className={cn(
                    "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                    extras.includes(x.key) ? "border-primary bg-primary/5" : "border-line",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[rgb(var(--c-primary))]"
                    checked={extras.includes(x.key)}
                    onChange={(e) =>
                      setExtras((prev) => (e.target.checked ? [...prev, x.key] : prev.filter((k) => k !== x.key)))
                    }
                  />
                  <span>
                    <span className="block font-medium text-ink">{x.label}</span>
                    <span className="block text-xs text-muted">{x.description}</span>
                  </span>
                </label>
              ))}
            </div>
            {fieldError("extras")}
          </fieldset>
        )}

        <div>
          <label className="label" htmlFor="o-brief">
            Your brief
          </label>
          <textarea
            id="o-brief"
            ref={briefRef}
            className="input min-h-[112px] py-2"
            placeholder={
              kind === "VIDEO"
                ? "e.g. A landlord relaxes while tenants top up their own prepaid meters by M-Pesa. Our price is KES 4,750. End on our logo."
                : kind === "IMAGE"
                  ? "e.g. A launch poster for our prepaid meter: KES 4,750, free installation, pay on delivery. Green brand colours."
                  : "e.g. Swahili voice-over and subtitles for a 20-second video we already have."
            }
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            maxLength={4000}
            required
          />
          {fieldError("brief")}
        </div>

        {kind !== "QUOTE" && (
          <div>
            <label className="label" htmlFor="o-link">
              Link to your logo or photos <span className="font-normal text-muted">(optional)</span>
            </label>
            <input
              id="o-link"
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://drive.google.com/…"
              value={referenceLink}
              onChange={(e) => setReferenceLink(e.target.value)}
            />
            {fieldError("referenceLink")}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="o-name">
              Your name
            </label>
            <input id="o-name" className="input" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
            {fieldError("name")}
          </div>
          <div>
            <label className="label" htmlFor="o-phone">
              Phone number (we may call or WhatsApp)
            </label>
            <input
              id="o-phone"
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0712 345 678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            {fieldError("phone")}
          </div>
          <div>
            <label className="label" htmlFor="o-email">
              Email <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="o-email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {fieldError("email")}
          </div>
          <div>
            <label className="label" htmlFor="o-business">
              Business name <span className="font-normal text-muted">(optional)</span>
            </label>
            <input id="o-business" className="input" autoComplete="organization" value={business} onChange={(e) => setBusiness(e.target.value)} />
          </div>
        </div>

        {/* Honeypot: hidden from people and from assistive technology. */}
        <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="o-website">Website</label>
          <input id="o-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="mt-6 flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        {kind === "QUOTE" ? (
          <p className="text-sm text-muted">Priced on request. Nothing is charged now.</p>
        ) : (
          <div>
            <p className="text-sm text-muted">
              {kind === "IMAGE"
                ? `${images} image${images === 1 ? "" : "s"} · ${quote?.credits ?? "-"} credits`
                : `${seconds} s video · ${quote?.credits ?? "-"} credits`}
            </p>
            <p className="text-2xl font-semibold tabular-nums text-ink">
              <span className="mr-1 text-sm font-normal text-muted">Estimate</span>
              {quote ? formatKES(quote.amountCents) : "-"}
            </p>
          </div>
        )}
        <button type="submit" className="btn-primary min-w-[220px]" disabled={submitting}>
          {submitting ? <LoaderIcon className="h-4 w-4 animate-spin" /> : null}
          {kind === "QUOTE" ? "Request a quote" : "Send my request"}
        </button>
      </div>
      <p className="mt-3 text-xs text-muted">
        Nothing is charged now. We confirm the final price, then you pay on your private order page by M-Pesa or card.
      </p>
    </form>
  );
}
